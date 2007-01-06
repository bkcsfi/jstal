// jstal.js - javascript implementation of TAL
// runs on the client

// xmlns:jtal="http://murkworks.com/namespaces/javascripttal"

var JAVASCRIPT_TAL_NAMESPACE="http://murkworks.com/namespaces/javascripttal";


jsTalTemplate = function(args) {
	this.template_element = args.template_element;
	if(!this.template_element) 
	    throw new TypeError("dom_element must be defined");
	    
	this.jstal_namespace = JAVASCRIPT_TAL_NAMESPACE;
}

jsTalTemplate.prototype = {

	"tal_to_html": function(context) {
		// expand the template and
		// return the expanded results as a string of html
		// context is an object containing the
		// root context
		
		return null;
	},
	
	"compile": function() {
		// compile the source dom object
		this.compiled_template = this.compile_element(this.template_element, {});
	},

	"compile_element" : function(element, parent_namespace_map) {
		// compile this element and it's children into
		// a template and return it
		
		
		// what do we need in each element?
		// element tag and namespace
		// attributes
		// child nodes
		// conditional of the element
		// replace element
		// repeat and defines
		
		var e = {};	// use a plain dict to store element information
		var namespace_info = this.extract_namespace_info(element, parent_namespace_map);
		e.namespace_info = namespace_info;
		
		if(namespace_info.namespaceURI && 
			parent_namespace_map[namespace_info.namespaceURI] === undefined &&
			namespace_info.prefix) {
			e.declare_namespaces = [[namespace_info.namespaceURI, namespace_info.prefix]];
			
			// remember we're going to declare it
			parent_namespace_map[namespace_info.namespaceURI] = namespace_info.prefix;
		}

		var element_attributes = {};	// element attributes to be generated
		var tal_attributes = {};	// tal attributes to be expanded

		// iterate over element template attributes
		var attributes = element.attributes;
		for(var i=0, l=attributes.length; i < l; i++) {
			var attribute = attributes[i];
			var namespace_info = this.extract_namespace_info(attribute, parent_namespace_map);
			if((namespace_info.namespaceURI || '').toLowerCase() == 'http://www.w3.org/2000/xmlns/')
				continue; // ignore xmlns declaration
				
			namespace_info.nodeValue = attribute.nodeValue;

			if(namespace_info.namespaceURI != this.jstal_namespace) {
				// a regular attribute
				if(namespace_info.namespaceURI && 
					parent_namespace_map[namespace_info.namespaceURI] === undefined &&
					namespace_info.prefix) {
					e.declare_namespaces = [[namespace_info.namespaceURI, namespace_info.prefix]];
					
					// remember we're going to declare it
					parent_namespace_map[namespace_info.namespaceURI] = namespace_info.prefix;
				}
				
				element_attributes[namespace_info.local_name] = namespace_info;
			} else 
				tal_attributes[namespace_info.local_name] = namespace_info;
		}
		
		e.element_attributes = element_attributes;
		e.tal_attributes = tal_attributes;
		
		// expand children
		var childNodes = [];
		for(var node=element.firstChild; node; node=node.nextSibling) {
			if (node.nodeType == 1) {	// element
				var parent_namespace_map_copy = this.copy_object(parent_namespace_map);
				childNodes.push(
					{
						"nodeType":1,
						"compiled_template":this.compile_element(node, parent_namespace_map_copy)
					}
				);
				
			} else if(node.nodeType == 3) { // text node
				childNodes.push(
					{
						"nodeType":3,
						"nodeValue":node.nodeValue
					}
				);
			}
		} 	// end for node
		
		e.childNodes = childNodes;
		
		return e;
	},
	
	"extract_namespace_info" : function(node) {
		// extract localname, prefix and namespace
		// declarations. 
		// namespace_map is a mapping of namespaces already declared
		// by a parent node
	
		console.debug("node ",node);
		var local_name = node.localName;
		var prefix = node.prefix || null;
		var namespaceURI = node.namespaceURI;
		return {
			"local_name":local_name,
			"prefix":prefix,
			"namespaceURI":namespaceURI
		}
	},
	
	"copy_object": function(obj) {
		// returns a shall copy of the object
		var o = {};
		for(var s in obj) {
			o[s] = obj[s];
		}
		return o;
	}
}