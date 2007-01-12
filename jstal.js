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
			'repeat':{},
			'locals':{},
			'globals':{},
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

		var tagname = this.generate_tagname(node_info);
		
		result_html.push('<'+tagname+attrs + '>');
		close_tag = "</" +tagname + ">";
		var process_child_nodes = true;
		
		try {
			var tal_attributes = template.tal_attributes;
			var tal_content = tal_attributes['content'];
			if(tal_content) {
				// replace the content of this element
				// with expression result
				var content = tal_content.expression(context);
				if(content !== JAVASCRIPT_TAL_DEFAULT) {
					process_child_nodes = false;
					if(content === JAVASCRIPT_TAL_NOTHING)
						content = '';
					result_html.push(content);
				}
			} 
		}
		catch(e) {
			// an error occured in content, do we have an on-error?
			if(template.onerror) {
				process_child_nodes = false;
				var content = template.onerror(context, e, template);
				if(content !== JAVASCRIPT_TAL_DEFAULT && content !== JAVASCRIPT_TAL_NOTHING) {
					result_html.push(content);
				}
			} else throw e;
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

	"compile_element" : function(element, parent_namespace_map, on_error_expression) {
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
				
				this.compile_tal_attribute(node_info, e.node_info);
				
			}
		}
		
		e.element_attributes = element_attributes;
		e.tal_attributes = tal_attributes;
		e.sometimes_omit_tag = false;
		
		var tal_onerror = tal_attributes['on-error'];
		if(tal_onerror !== undefined && tal_onerror.expression) {
			e.onerror = on_error_expression = tal_onerror.expression;
		} else
			e.onerror = on_error_expression;
			
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
				childNodes.push(this.compile_element(node, parent_namespace_map_copy, on_error_expression));
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
	
	"compile_tal_attribute" : function(node_info, parent_node_info) {
		var nodeValue = node_info.nodeValue;
		var tagname = this.generate_tagname(parent_node_info);
		switch(node_info.local_name)  {
			case "content" :
				node_info.expression = this.decode_expression(nodeValue,
											'<'+tagname +" tal:content='"+nodeValue + "' />");
				break;
			case "on-error" :
				node_info.expression = this.decode_expression(nodeValue,
											'<'+tagname +" tal:on-error='"+nodeValue + "' />");
				break;
		}
	},
	
	"trim" : function(s) {
		// trim leading and trailing whitespace
		return s.replace(/^\\s+|\\s+$/g,'');
	},
	
	"generate_tagname" : function(node_info) {
		// return tagname string, possible with xmlns
		if(node_info.prefix)
			return node_info.prefix + ':' + node_info.local_name;
		else
			return node_info.local_name;
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
	
	"decode_expression" : function(expression_text, error_hint) {
		// given expression text, determine which 
		// type of expression it is and return a function
		// for that type
		
		// expressions could be
		// string: some string
		// path: some path
		// javascript: expression (declares a function whose sole arg is context, must return something)
		// default expression type is path
		// not: is a valid prefix
		
		// for now, only handle path expression w/o leading path:
		expression_text = this.trim(expression_text);
		var negate_expression_results = false;
		if(0 == expression_text.indexOf('not:')) {
			expression_text = this.trim(expression_text.substr(4));
			negate_expression_results = true;
		}
		
		if(0 == expression_text.indexOf('string:')) {
			// a string expression
			expression_text = this.trim(expression_text.substr(7));
			var expression = this.compile_string_expression(expression_text,error_hint);
		} else if(0 == expression_text.indexOf('javascript:')) {
			// a string expression
			expression_text = this.trim(expression_text.substr(11));
			var expression = this.compile_javascript_expression(expression_text,error_hint);
		} else if(0 == expression_text.indexOf('path:')) {
			// a string expression
			expression_text = this.trim(expression_text.substr(5));
			var expression = this.compile_string_expression(expression_text,error_hint);
		} else {
			// default to path
			var expression = this.compile_path_expression(expression_text, error_hint);
		}
		if(negate_expression_results) {
			var negate = function() {
				var results = expression.apply(this, arguments);
				if(typeof results == 'function') {
					throw new Error("expression returned function, which cannot be negated: "+error_hint);
				}
				if(results) 
					return false;
				else
					return true;
			}
			return negate;
		} else
			return expression;
	},

	"compile_string_expression" : function(expression_text, error_hint) {
		// generates a function object that returns evaluated string
		// for now, just return the text

		var function_text = [];
		function_text.push('return "'+expression_text+'";');

		function_text = function_text.join("\n");
		console.debug("compile string", expression_text, "to", function_text);
		return new Function('context', function_text);
		
	},

	"compile_javascript_expression" : function(expression_text, error_hint) {
		// generates a function object from the expression text

		var function_text = [];
		return new Function('context', expression_text);		
	},
	
	"compile_path_expression" : function(expression_text, error_hint) {
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
				var start_index = 0;
				// TODO: in the future, we may wish to optimize
				// lookups by allowing something like options/x.y.z
				// where x or y might end up being undefined
				// to allow this, I'd need to push a try /catch
				// around the do / while. I'm not doing that right now
				// because setting up exception handling might have
				// a performance impact. So, you *can* to options/x.y.z
				// but if x or y is undefined, you'll get an overall exception
				function_text.push('do {');
				
				// determine if this will be a variable lookup or
				// a special namespace lookup, such as options or repeat
				if(steps[0] == 'options') {
					// lookup in options, not locals or globals
					function_text.push('var c = context.options;'); // establish current context
					start_index = 1;	// skip this step
				} else if(steps[0] == 'repeat') {
					// lookup in repeat, not locals or globals
					function_text.push('var c = context.repeat;'); // establish current context
					start_index = 1;	// skip this step
				} else {
					// generic variable, test locals first, then globals
					function_text.push('if(context.locals.' + steps[0] + ' !== undefined) { var c = context.locals; }'); // establish current context
					function_text.push('else if(context.globals.' + steps[0] + ' !== undefined) { var c = context.globals; }'); // establish current context
					function_text.push('else break;');
				}
				for(var is=start_index, ls=steps.length; is < ls; is++) {
					var step = steps[is];
					function_text.push('c=c.'+step+';');
					if(is+1 == ls) {
						// on the last step, optimize the test
						function_text.push("if(c !== undefined) return c;");
					} else
						function_text.push("if(c === undefined) break;");
				}
				function_text.push('} while(false);');
			}
		}
		if(!error_hint)
			error_hint = expression;
		function_text.push('throw new Error("expression evaluation failed: ' + error_hint + '");');
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