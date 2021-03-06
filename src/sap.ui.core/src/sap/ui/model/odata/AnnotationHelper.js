/*!
 * ${copyright}
 */

// Provides object sap.ui.model.odata.AnnotationHelper
sap.ui.define(['jquery.sap.global', 'sap/ui/base/BindingParser'],
	function(jQuery, BindingParser) {
		'use strict';

		var AnnotationHelper,
			rBadChars = /[\\\{\}:]/, // @see sap.ui.base.BindingParser: rObject, rBindingChars
			// path to entity type ("/dataServices/schema/<i>/entityType/<j>")
			rEntityTypePath = /^(\/dataServices\/schema\/\d+\/entityType\/\d+)(?:\/|$)/,
			fnEscape = BindingParser.complexParser.escape;

		/**
		 * Handling of "14.5.3.1.1 Function odata.concat".
		 *
		 * @param {object[]} aParameters
		 *   the parameters
		 * @param {object} oInterface
		 *   the callback interface related to the current formatter call
		 * @returns {string}
		 *   the resulting string value to write into the processed XML
		 */
		function concat(aParameters, oInterface) {
			var aParts = [],
				i, oParameter;

			for (i = 0; i < aParameters.length; i += 1) {
				oParameter = aParameters[i];
				if (oParameter) {
					switch (oParameter.Type) {
					case "Path":
						aParts.push(formatPath(oParameter.Value, oInterface, true));
						break;
					case "String":
						aParts.push(escapedString(oParameter.Value));
						break;
					//TODO support non-string constants
					default:
						aParts.push("<" + unsupported(oParameter) + ">");
					}
				} else {
					aParts.push("<" + unsupported(oParameter) + ">");
				}
			}
			return aParts.join("");
		}

		/**
		 * Returns the given value properly turned into a string and escaped.
		 *
		 * @param {any} vValue
		 *   any value
		 * @returns {string}
		 *   the given value properly turned into a string and escaped
		 */
		function escapedString(vValue) {
			return fnEscape(String(vValue));
		}

		/**
		 * Handling of "14.5.3.1.2 Function odata.fillUriTemplate".
		 *
		 * @param {object[]} aParameters
		 *   the parameters
		 * @param {object} oInterface
		 *   the callback interface related to the current formatter call
		 * @returns {string}
		 *   an expression binding in the format "{= odata.fillUriTemplate('template',
		 *   {'param1': ${path1}, 'param2': ${path2}, ...}" or <code>undefined</code>
		 *   if the parameters could not be processed
		 */
		function fillUriTemplate(aParameters, oInterface) {
			var i,
				aParts = [],
				sPrefix,
				sValue;

			if (!jQuery.isArray(aParameters) || !aParameters.length
					|| aParameters[0].Type !== "String") {
				return undefined;
			}
			aParts.push('{= odata.fillUriTemplate(');
			aParts.push(stringify(aParameters[0].Value));
			aParts.push(', {');
			sPrefix = "";
			for (i = 1; i < aParameters.length; i += 1) {
				aParts.push(sPrefix);
				aParts.push(stringify(aParameters[i].Name));
				aParts.push(": ");
				sValue = aParameters[i].Value.Value;
				// TODO support expressions, not only paths
				if (aParameters[i].Value.Type !== "Path" || rBadChars.test(sValue)) {
					aParts.push("'<Unsupported: ");
					aParts.push(stringify(aParameters[i].Value).replace(/'/g, "\\'"));
					aParts.push(">'");
				} else {
					aParts.push("${");
					aParts.push(sValue);
					aParts.push("}");
				}
				sPrefix = ", ";
			}
			aParts.push("})}");
			return aParts.join("");
		}

		/**
		 * Follows the given path in the given model, starting at the given absolute path,
		 * and returns the resulting absolute path.
		 *
		 * @param {sap.ui.model.odata.ODataMetaModel} oModel
		 *   the current model
		 * @param {string} sContextPath
		 *   an absolute path to start from
		 * @param {string} sPath
		 *   the value of the dynamic "14.5.12 Expression edm:Path" (or variant thereof)
		 * @returns {string}
		 *   the resulting absolute path
		 */
		function follow(oModel, sContextPath, sPath) {
			var oAssociationEnd,
				oEntity,
				aParts = sPath.split("/");

			while (sPath && aParts.length && sContextPath) {
				if (aParts[0].charAt(0) === "@") {
					// term cast
					sContextPath += "/" + aParts[0].slice(1);
					aParts.shift();
					continue;
				}

				oEntity = oModel.getObject(sContextPath);
				oAssociationEnd = oModel.getODataAssociationEnd(oEntity, aParts[0]);
				if (oAssociationEnd) {
					// navigation property
					sContextPath = oModel.getODataEntityType(oAssociationEnd.type, true);
					aParts.shift();
					continue;
				}

				// structural properties or some unsupported case
				sContextPath = oModel.getODataProperty(oEntity, aParts, true);
			}

			return sContextPath;
		}

		/**
		 * Handling of "14.5.12 Expression edm:Path".
		 *
		 * @param {string} sPath
		 *   the string path value from the meta model
		 * @param {object} oInterface
		 *   the callback interface related to the current formatter call
		 * @param {boolean} bWithType
		 *   if <code>true</code> the type is included into the binding
		 * @returns {string}
		 *   the resulting string value to write into the processed XML
		 */
		function formatPath(sPath, oInterface, bWithType) {
			var oConstraints = {},
				oModel = oInterface.getModel(),
				sContextPath = oInterface.getPath(),
				aMatches = rEntityTypePath.exec(sContextPath),
				aProperties,
				sType;


			if (aMatches) {
				// go up to "/dataServices/schema/<i>/entityType/<j>/", then down to ".../property"
				aProperties = oModel.getProperty(aMatches[1] + "/property");

				jQuery.each(aProperties, function (i, oProperty) {
					if (oProperty.name === sPath) {
						switch (oProperty.type) {
						case "Edm.Boolean":
							sType = 'sap.ui.model.odata.type.Boolean';
							break;

						case "Edm.DateTime":
							sType = 'sap.ui.model.odata.type.DateTime';
							oConstraints.displayFormat = oProperty["sap:display-format"];
							break;

						case "Edm.DateTimeOffset":
							sType = 'sap.ui.model.odata.type.DateTimeOffset';
							break;

						case "Edm.Decimal":
							sType = 'sap.ui.model.odata.type.Decimal';
							oConstraints.precision = oProperty.precision;
							oConstraints.scale = oProperty.scale;
							break;

						case "Edm.Double":
							sType = 'sap.ui.model.odata.type.Double';
							break;

						case "Edm.Guid":
							sType = 'sap.ui.model.odata.type.Guid';
							break;

						case "Edm.Int16":
							sType = 'sap.ui.model.odata.type.Int16';
							break;

						case "Edm.Int32":
							sType = 'sap.ui.model.odata.type.Int32';
							break;

						case "Edm.Int64":
							sType = 'sap.ui.model.odata.type.Int64';
							break;

						case "Edm.SByte":
							sType = 'sap.ui.model.odata.type.SByte';
							break;

						case "Edm.String":
							sType = 'sap.ui.model.odata.type.String';
							oConstraints.maxLength = oProperty.maxLength;
							break;

						case "Edm.Time":
							sType = 'sap.ui.model.odata.type.Time';
							break;

						default:
							// type remains undefined, no mapping is known
						}
						oConstraints.nullable = oProperty.nullable;
					}
				});
			}

			if (bWithType && sType) {
				return "{path : " + stringify(sPath) + ", type : '" + sType
					+ "', constraints : " + stringify(oConstraints) + "}";
			} else if (rBadChars.test(sPath)) {
				return "{path : " + stringify(sPath) + "}";
			} else {
				return "{" + sPath + "}";
			}
		}

		/**
		 * Warns about an illegal value for a type and returns an appropriate string representation
		 * of the value.
		 *
		 * @param {any} vRawValue
		 *   the raw value from the meta model
		 * @param {string} sName
		 *   the name of the property which holds the illegal value
		 * @returns {string}
		 *   the resulting string value to write into the processed XML
		 */
		function illegalValue(vRawValue, sName) {
			jQuery.sap.log.warning("Illegal value for " + sName + ": "
					+ vRawValue[sName], null, "sap.ui.model.odata.AnnotationHelper");
			return escapedString(vRawValue[sName]);
		}

		/**
		 * Follows the given path in the given model, starting at the given absolute path, and
		 * returns whether the navigation path ends with an association end with multiplicity "*".
		 *
		 * @param {sap.ui.model.odata.ODataMetaModel} oModel
		 *   the current model
		 * @param {string} sContextPath
		 *   an absolute path to start from
		 * @param {string} sPath
		 *   the value of the dynamic "14.5.12 Expression edm:Path" (or variant thereof)
		 * @returns {boolean}
		 *    whether the navigation path ends with an association end with multiplicity "*";
		 *    returns <code>undefined</code> in case the navigation path cannot be determined
		 *    (this is treated as falsy in <code>template:if</code> statements!)
		 * @throws {Error}
		 *   if the navigation path has an association end with multiplicity "*" which is not
		 *   the last one
		 * @see sap.ui.model.odata.AnnotationHelper.isMultiple
		 */
		function isMultiple(oModel, sContextPath, sPath) {
			var oAssociationEnd,
				oEntity,
				iIndexOfAt,
				bMultiplicity = false,
				aParts = sPath.split("/"),
				sSegment;

			while (sPath && aParts.length && sContextPath) {
				sSegment = aParts[0];
				iIndexOfAt = sSegment.indexOf("@");
				if (iIndexOfAt === 0) {
					// term cast
					sContextPath += "/" + sSegment.slice(1);
					aParts.shift();
					continue;
				} else if (iIndexOfAt > 0) { // annotation of a navigation property
					sSegment = sSegment.slice(0, iIndexOfAt);
				}

				oEntity = oModel.getObject(sContextPath);
				oAssociationEnd = oModel.getODataAssociationEnd(oEntity, sSegment);
//TODO				if (oAssociationEnd) {
					// navigation property
					if (bMultiplicity) {
						throw new Error(
							'Association end with multiplicity "*" is not the last one: '
							+ sPath);
					}
					bMultiplicity = oAssociationEnd.multiplicity === "*";
					sContextPath = oModel.getODataEntityType(oAssociationEnd.type, true);
					aParts.shift();
					continue;
//				}
//
//				// structural properties or some unsupported case
//TODO				sContextPath = oModel.getODataProperty(oEntity, aParts, true);
			}

			return bMultiplicity;
		}

		/**
		 * Stringifies the value for usage in a XML attribute value. Prefers the single quote over
		 * the double quote.
		 *
		 * @param {any} vValue the value
		 * @returns {string} the stringified value
		 * @throws {Error} if the value cannot be stringified
		 */
		function stringify(vValue) {
			var sStringified = JSON.stringify(vValue),
				bEscaped = false,
				sResult = "",
				i, c;

			for (i = 0; i < sStringified.length; i += 1) {
				switch (c = sStringified.charAt(i)) {
					case "'": // a single quote must be escaped (can only occur within a string)
						sResult += "\\'";
						break;
					case '"':
						if (bEscaped) { // a double quote needs no escaping (only within a string)
							sResult += c;
							bEscaped = false;
						} else { // string begin or end with single quotes
							sResult += "'";
						}
						break;
					case "\\":
						if (bEscaped) { // an escaped backslash
							sResult += "\\\\";
						}
						bEscaped = !bEscaped;
						break;
					default:
						if (bEscaped) {
							sResult += "\\";
							bEscaped = false;
						}
						sResult += c;
				}
			}
			return sResult;
		}

		/**
		 * Handles unsupported cases.
		 *
		 * @param {any} vRawValue
		 *   the raw value from the meta model
		 * @returns {string}
		 *   the resulting string value to write into the processed XML
		 */
		function unsupported(vRawValue) {
			if (typeof vRawValue === "object") {
				// anything else: convert to string, prefer JSON
				try {
					return fnEscape("Unsupported: " + stringify(vRawValue));
				} catch (ex) {
					// "Converting circular structure to JSON"
				}
			}
			return escapedString(vRawValue);
		}

		/**
		 * @classdesc
		 * A collection of methods which help to consume
		 * <a href="http://docs.oasis-open.org/odata/odata/v4.0/odata-v4.0-part3-csdl.html">
		 * OData v4 annotations</a> in XML template views.
		 *
		 * Formatter functions like {@link #.format format} and {@link #.simplePath simplePath} can
		 * be used in complex bindings to turn OData v4 annotations into texts or data bindings,
		 * e.g. <code>&lt;sfi:SmartField value="{path: 'meta>Value', formatter:
		 * 'sap.ui.model.odata.AnnotationHelper.simplePath'}"/></code>.
		 *
		 * Helper functions like {@link #.resolvePath resolvePath} can be used by template
		 * instructions in XML template views, e.g. <code>&lt;template:with path="meta>Value"
		 * helper="sap.ui.model.odata.AnnotationHelper.resolvePath" var="target"></code>.
		 *
		 * You need to {@link jQuery.sap.require} this module before use!
		 *
		 * @public
		 * @namespace sap.ui.model.odata.AnnotationHelper
		 */
		AnnotationHelper = /** @lends sap.ui.model.odata.AnnotationHelper */ {
			/**
			 * A formatter function to be used in a complex binding inside an XML template view
			 * in order to interpret OData v4 annotations. It knows about
			 * <ul>
			 *   <li> the constant "14.4.11 Expression edm:String", which is turned into a fixed
			 *   text;
			 *   <li> the dynamic "14.5.3 Expression edm:Apply"
			 *   <ul>
			 *     <li> "14.5.3.1.1 Function odata.concat" is turned into a data binding
			 *     expression relative to an entity;
			 *     <li> "14.5.3.1.2 Function odata.fillUriTemplate" is turned into an expression
			 *     binding to fill the template at run-time;
			 *   </ul>
			 *   <li> the dynamic "14.5.12 Expression edm:Path", which is turned into a data
			 *   binding relative to an entity, including type information and constraints as
			 *   available from meta data.
			 * </ul>
			 * Unsupported values are turned into a string nevertheless, but indicated as such.
			 * Illegal values are output "as is" for a human reader to make sense of them.
			 * Proper escaping is used to make sure that data binding syntax is not corrupted.
			 *
			 * Example:
			 * <pre>
			 * &lt;Text text="{path: 'meta>Value', formatter: 'sap.ui.model.odata.AnnotationHelper.format'}" />
			 * </pre>
			 *
			 * @param {object} oInterface
			 *   the callback interface related to the current formatter call
			 * @param {any} vRawValue
			 *   the raw value from the meta model
			 * @returns {string}
			 *   the resulting string value to write into the processed XML
			 * @public
			 */
			format : function (oInterface, vRawValue) {
				var aMatches, sResult;

				// 14.4.11 Expression edm:String
				if (vRawValue && vRawValue.hasOwnProperty("String")) {
					if (typeof vRawValue.String === "string") {
						aMatches = rEntityTypePath.exec(oInterface.getPath());
						if (aMatches) {
							return formatPath("##"
								+ oInterface.getPath().slice(aMatches[1].length + 1) + "/String",
								oInterface, false);
						}
						return fnEscape(vRawValue.String);
					}
					return illegalValue(vRawValue, "String");
				}

				// 14.5.12 Expression edm:Path
				if (vRawValue && vRawValue.hasOwnProperty("Path")) {
					if (typeof vRawValue.Path === "string") {
						return formatPath(vRawValue.Path, oInterface, true);
					}
					return illegalValue(vRawValue, "Path");
				}

				// 14.5.3 Expression edm:Apply
				if (vRawValue && vRawValue.Apply && typeof vRawValue.Apply === "object") {
					switch (vRawValue.Apply.Name) {
					case "odata.concat": // 14.5.3.1.1 Function odata.concat
						if (jQuery.isArray(vRawValue.Apply.Parameters)) {
							return concat(vRawValue.Apply.Parameters, oInterface);
						}
						break;
					case "odata.fillUriTemplate": // 14.5.3.1.2 Function odata.fillUriTemplate
						sResult = fillUriTemplate(vRawValue.Apply.Parameters, oInterface);
						if (sResult) {
							return sResult;
						}
						break;
					// fall through to the global "unsupported"
					// no default
					}
				}

				return unsupported(vRawValue);
			},

			/**
			 * A formatter function to be used in a complex binding inside an XML template view
			 * in order to interpret OData v4 annotations. It knows about the dynamic
			 * "14.5.2 Expression edm:AnnotationPath" and returns a binding expression for a
			 * navigation path in an OData model, starting at an entity.
			 * Currently supports navigation properties. Term casts and annotations of
			 * navigation properties terminate the navigation path.
			 *
			 * Examples:
			 * <pre>
			 * &lt;template:if test="{path: 'facet>Target', formatter: 'sap.ui.model.odata.AnnotationHelper.getNavigationPath'}">
			 *     &lt;form:SimpleForm binding="{path: 'facet>Target', formatter: 'sap.ui.model.odata.AnnotationHelper.getNavigationPath'}" />
			 * &lt;/template:if>
			 * </pre>
			 *
			 * @param {object} oInterface
			 *   the callback interface related to the current formatter call
			 * @param {any} vRawValue
			 *   the raw value from the meta model, e.g. <code>{AnnotationPath :
			 *   "ToSupplier/@com.sap.vocabularies.Communication.v1.Address"}</code> or <code>
			 *   {AnnotationPath : "@com.sap.vocabularies.UI.v1.FieldGroup#Dimensions"}</code>
			 * @returns {string}
			 *   the resulting string value to write into the processed XML, e.g. "{ToSupplier}"
			 *   or "{}" (in case no navigation is needed); returns "" in case the navigation path
			 *   cannot be determined (this is treated as falsy in <code>template:if</code>
			 *   statements!)
			 * @public
			 */
			getNavigationPath : function (oInterface, vRawValue) {
				var aParts = [];

				if (!vRawValue.AnnotationPath) {
					return "";
				}

				jQuery.each(vRawValue.AnnotationPath.split("/"), function (iUnused, sSegment) {
					var i = sSegment.indexOf("@");

					if (i === 0) { // term cast
						return false; // break
					} else if (i > 0) { // annotation of a navigation property
						aParts.push(sSegment.slice(0, i));
						return false; // break
					}
					// navigation property
					aParts.push(sSegment);
				});
				return "{" + aParts.join("/") + "}";
			},

			/**
			 * A formatter function to be used in a complex binding inside an XML template view
			 * in order to interpret OData v4 annotations. It knows about the dynamic
			 * "14.5.2 Expression edm:AnnotationPath" and returns whether the navigation path
			 * ends with an association end with multiplicity "*". It throws an error if the
			 * navigation path has an association end with multiplicity "*" which is not the last
			 * one.
			 * Currently supports navigation properties. Term casts and annotations of
			 * navigation properties terminate the navigation path.
			 *
			 * Examples:
			 * <pre>
			 * &lt;template:if test="{path: 'facet>Target', formatter: 'sap.ui.model.odata.AnnotationHelper.isMultiple'}">
			 * </pre>
			 *
			 * @param {object} oInterface
			 *   the callback interface related to the current formatter call
			 * @param {any} vRawValue
			 *   the raw value from the meta model, e.g. <code>{AnnotationPath :
			 *   "ToSupplier/@com.sap.vocabularies.Communication.v1.Address"}</code> or <code>
			 *   {AnnotationPath : "@com.sap.vocabularies.UI.v1.FieldGroup#Dimensions"}</code>;
			 *   embedded within an entity type
			 * @returns {boolean}
			 *    whether the navigation path ends with an association end with multiplicity "*";
			 *    returns <code>undefined</code> in case the navigation path cannot be determined
			 *    (this is treated as falsy in <code>template:if</code> statements!)
			 * @throws {Error}
			 *   if the navigation path has an association end with multiplicity "*" which is not
			 *   the last one
			 * @public
			 */
			isMultiple : function (oInterface, vRawValue) {
				var aMatches,
					oModel = oInterface.getModel(),
					sContextPath = oInterface.getPath(),
					aMatches = rEntityTypePath.exec(sContextPath);

//TODO				if (aMatches) {
					// start at entity type ("/dataServices/schema/<i>/entityType/<j>")
//					if (vRawValue.hasOwnProperty("AnnotationPath")) {
						return isMultiple(oModel, aMatches[1], vRawValue.AnnotationPath);
//					}
//					return undefined; // some unsupported case
//				}
			},

			/**
			 * Helper function for a <code>template:with</code> instruction that resolves a dynamic
			 * "14.5.2 Expression edm:AnnotationPath" or "14.5.12 Expression edm:Path".
			 * Currently supports navigation properties and term casts.
			 *
			 * Example:
			 * <pre>
			 *   &lt;template:with path="meta>Value" helper="sap.ui.model.odata.AnnotationHelper.resolvePath" var="target">
			 * </pre>
			 *
			 * @param {sap.ui.model.Context} oContext
			 *   a context which must point to an annotation or annotation property of type
			 *   <code>Edm.AnnotationPath</code> or <code>Edm.Path</code>, embedded within an
			 *   entity type;
			 *   the context's model must be an {@link sap.ui.model.odata.ODataMetaModel}
			 * @returns {string}
			 *   the path to the target, or <code>undefined</code> in case the path cannot be
			 *   resolved
			 * @public
			 */
			resolvePath : function (oContext) {
				var aMatches = rEntityTypePath.exec(oContext.getPath()),
					vRawValue = oContext.getObject();

				if (aMatches) {
					// start at entity type ("/dataServices/schema/<i>/entityType/<j>")
					if (vRawValue.hasOwnProperty("AnnotationPath")) {
						return follow(oContext.getModel(), aMatches[1], vRawValue.AnnotationPath);
					}
					if (vRawValue.hasOwnProperty("Path")) {
						return follow(oContext.getModel(), aMatches[1], vRawValue.Path);
					}
					return undefined; // some unsupported case
				}
			},

			/**
			 * A formatter function to be used in a complex binding inside an XML template view
			 * in order to interpret OData v4 annotations, quite like {@link #.format format} but
			 * with a simplified output aimed at design-time templating with smart controls.
			 * It only knows about the dynamic "14.5.12 Expression edm:Path", which is turned into
			 * a simple binding path, without type or constraint information (at least for those
			 * simple cases where this is possible).
			 *
			 * Example:
			 * <pre>
			 *   &lt;sfi:SmartField value="{path: 'meta>Value', formatter: 'sap.ui.model.odata.AnnotationHelper.simplePath'}"/>
			 * </pre>
			 *
			 * @param {object} oInterface
			 *   the callback interface related to the current formatter call
			 * @param {any} vRawValue
			 *   the raw value from the meta model
			 * @returns {string}
			 *   the resulting string value to write into the processed XML
			 * @public
			 */
			simplePath : function (oInterface, vRawValue) {
				// 14.5.12 Expression edm:Path
				if (vRawValue && vRawValue.hasOwnProperty("Path")) {
					if (typeof vRawValue.Path === "string") {
						//TODO oInterface should be 1st, consistently!
						return formatPath(vRawValue.Path, oInterface, false);
					}
					return illegalValue(vRawValue, "Path");
				}

				return unsupported(vRawValue);
			}
		};

		AnnotationHelper.format.$ = true;
		AnnotationHelper.getNavigationPath.$ = true;
		AnnotationHelper.isMultiple.$ = true;
		AnnotationHelper.simplePath.$ = true;

		return AnnotationHelper;
	}, /* bExport= */ true);
