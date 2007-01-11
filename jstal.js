// jstal.js - javascript implementation of TAL
// runs on the client

// xmlns:jal="http://murkworks.com/namespaces/javascript_tal"

var JAVASCRIPT_TAL_NAMESPACE="http://murkworks.com/namespaces/javascript_tal";

JAVASCRIPT_TAL_NOTHING = new Object();
JAVASCRIPT_TAL_DEFAULT = new Object();

jsTalTemplate = function(args) {
	this.template_element = args.template_element;
	if(!this.template_element) 
	    throw new TypeError("dom_element must be defined");
	    
	this.jstal_namespace = JAVASCRIPT_TAL_NAMESPACE;
	this.reserved_variable_names = { // templates should not define these
			'options':true,
			'nothing':true,
			'default':true,
			'repeat':true,
			'attrs':true,
		};
		
	this.strip_space_re = /[^ ]+/;	// .match returns a string of text w/o whitespace
}

jsTalTemplate.prototype = {

	"to_html": function(options) {
		// expand the template and
		// return the expanded results as a string of html
		// options is an object containing the
		// passed in args, see TALES specification
		
		var context = {
			'options':options,
			'repeat':{}
		};
		
		var template = this.compiled_template;
		var result_html = [];
		this.html_expand_template(template, context, result_html);
		return result_html.join("");
	},
	
	"html_expand_template" : function(template, context, result_html) {
		// expand this template and children, append to result_html
		if(3 == template.nodeType) {	// text node
			result_html.push(template.nodeValue);
			return;
		}
		var close_tag = null;
		var node_info = template.node_info;
		// simple, content  only supported
		var attrs = '';
		
		result_html.push('<'+node_info.local_name+attrs + '>');
		close_tag = "</" +node_info.local_name + ">";
		
		var tal_attributes = template.tal_attributes;
		var tal_define = tal_attributes['content'];
		var process_child_nodes = true;
		if(tal_define) {
			// replace the content of this element
			// with expression result
			var content = tal_define.expression(context);
			if(content !== JAVASCRIPT_TAL_DEFAULT) {
				process_child_nodes = false;
				if(content === JAVASCRIPT_TAL_NOTHING)
					content = '';
				result_html.push(content);
			}
		} 
		if(process_child_nodes) {
			var childNodes = template.childNodes;
	
			for(var i=0, l = childNodes.length; i < l; i++) {
				this.html_expand_template(childNodes[i], context, result_html);
			}
		}
		if(close_tag)
			result_html.push(close_tag);
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
		var node_info = this.extract_node_info(element, parent_namespace_map);
		e.node_info = node_info;
		
		if(node_info.namespaceURI && 
			parent_namespace_map[node_info.namespaceURI] === undefined &&
			node_info.prefix) {
			e.declare_namespaces = [[node_info.namespaceURI, node_info.prefix]];
			
			// remember we're going to declare it
			parent_namespace_map[node_info.namespaceURI] = node_info.prefix;
		}

		var element_attributes = {};	// element attributes to be generated
		var tal_attributes = {};	// tal attributes to be expanded

		// iterate over element template attributes
		var attributes = element.attributes;
		for(var i=0, l=attributes.length; i < l; i++) {
			var attribute = attributes[i];
			var node_info = this.extract_node_info(attribute, parent_namespace_map);
			if((node_info.namespaceURI || '').toLowerCase() == 'http://www.w3.org/2000/xmlns/')
				continue; // ignore xmlns declaration
				
			node_info.nodeValue = attribute.nodeValue;

			if(node_info.namespaceURI != this.jstal_namespace) {
				// a regular attribute
				if(node_info.namespaceURI && 
					parent_namespace_map[node_info.namespaceURI] === undefined &&
					node_info.prefix) {
					e.declare_namespaces = [[node_info.namespaceURI, node_info.prefix]];
					
					// remember we're going to declare it
					parent_namespace_map[node_info.namespaceURI] = node_info.prefix;
				}
				
				element_attributes[node_info.local_name] = node_info;
			} else {
				var local_name = node_info.local_name;
				tal_attributes[local_name] = node_info;
				
				this.compile_tal_attribute(node_info);
				
			}
		}
		
		e.element_attributes = element_attributes;
		e.tal_attributes = tal_attributes;
		e.sometimes_omit_tag = false;
		
		if(tal_attributes['omit-tag'] !== undefined) {
			e.sometimes_omit_tag = true;
			if(!tal_attributes['omit-tag'].nodeValue) {
				// empty string means we will always 
				// omit the tag, so don't need to test during
				// expansion
				e.always_omit_tag = true;
			} 
			if(e.declare_namespaces) {
				// this tag might get left out, so
				// tell children we're not going to declare
				// any namespaces
				for(var i=0, l=e.declare_namespaces.length; i < l; i++) {
					var namespace = e.declare_namespaces[i];
					delete parent_namespace_map[namespace[0]];
				}
			}
		}
		// expand children
		var childNodes = [];
		for(var node=element.firstChild; node; node=node.nextSibling) {
			if (node.nodeType == 1) {	// element
				var parent_namespace_map_copy = this.copy_object(parent_namespace_map);
				childNodes.push(this.compile_element(node, parent_namespace_map_copy));				
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
	
	"compile_tal_attribute" : function(node_info) {
		var nodeValue = node_info.nodeValue;
		
		switch(node_info.local_name)  {
			case "content" :
				node_info.expression = this.decode_expression(nodeValue);
				break;
		}
	},
	
	"extract_node_info" : function(node) {
		// extract localname, prefix and namespace
		// declarations. 
		// namespace_map is a mapping of namespaces already declared
		// by a parent node
	
		var local_name = node.localName;
		var prefix = node.prefix || null;
		var namespaceURI = node.namespaceURI;
		return {
			"local_name":local_name,
			"prefix":prefix,
			"namespaceURI":namespaceURI
		}
	},
	
	"decode_expression" : function(expression_text) {
		// given expression text, determine which 
		// type of expression it is and return a function
		// for that type
		
		// for now, only handle path expression w/o leading path:
		return this.compile_path_expression(expression_text);
	},
	
	"compile_path_expression" : function(expression_text) {
		// generates a function object that evaluates context
		// and returns a value
		// TALES spec, path:a/b/c  | nothing
		// maybe later, allowences for E4X or xpath
		
		var terminals = expression_text.split('|');
		var expressions = [];
		var match = this.strip_space_re;
		for(i=0, l=terminals.length; i < l; i++) {
			console.debug("testing i",i," = ", terminals[i]);
			var terminal = terminals[i].match(match);
			console.debug("terminal", terminal);
			if(!terminal  || !terminal.length) {
				throw new TypeError("missing path text when evaluating path expression:"+expression_text);
			}
			expressions.push(terminal[0]);
		}
		var function_text = [];
		
		for(var i=0, l=expressions.length; i < l; i++) {
			// every expression starts with the default context
			var expression = expressions[i];
			if(expression == 'nothing') {
				function_text.push('return JAVASCRIPT_TAL_NOTHING;');			
			} else if(expression == 'default') {
				function_text.push('return JAVASCRIPT_TAL_DEFAULT;');
			} else {
				var steps = expression.split('/');
				function_text.push('do {');
				function_text.push('var c = context;'); // establish current context
				for(var is=0, ls=steps.length; is < ls; is++) {
					var step = steps[is];
					function_text.push('c=c.'+step+';');				
					function_text.push('if(!c) break;');
				}
				function_text.push('} while(false);');
				function_text.push('if(c) return c;');
			}
		}
		function_text.push('throw new Error("expression evaluation failed: ' + expression + '");');
		function_text = function_text.join("\n");
		console.debug("compile ", expression_text, "to", function_text);
		return new Function('context', function_text);
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