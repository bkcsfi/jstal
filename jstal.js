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
	
	// prefix_to_namespace_map is used by IE to map
	// a prefix back to a namespaceURI because
	// IE does not support namespaceURI on nodes.
	if(args.prefix_to_namespace_map)
		this.prefix_to_namespace_map = args.prefix_to_namespace_map;
	else
		this.prefix_to_namespace_map = {
			'jtal':JAVASCRIPT_TAL_NAMESPACE,
			'jstal':JAVASCRIPT_TAL_NAMESPACE,
			'jal':JAVASCRIPT_TAL_NAMESPACE
		};
	
	this.jstal_namespace = JAVASCRIPT_TAL_NAMESPACE;
	this.reserved_variable_names = { // templates should not define these
			'options':true,
			'nothing':true,
			'default':true,
			'repeat':true
		};
		
	this.strip_space_re = /[^ ]+/;	// .match returns a string of text w/o whitespace
	this.escape_content_match = /&|<|>/; // match if we need to escape content
}

jsTalTemplate.prototype = {

	"to_html": function(options) {
		// expand the template and
		// return the expanded results as a string of html
		// options is an object containing the
		// passed in args, see TALES specification

		var CONTEXTS = {
			'nothing':JAVASCRIPT_TAL_NOTHING,
			'default':JAVASCRIPT_TAL_DEFAULT,
			'options':options,
			'repeat':{}
		}
		
		var context = {
			'options':options,
			'repeat':{},
			'locals':{
				'nothing':JAVASCRIPT_TAL_NOTHING,
				'default':JAVASCRIPT_TAL_DEFAULT
			},
			'globals':{},
			'CONTEXTS':CONTEXTS
		};
		var template = this.compiled_template;
		var result_html = [];
		this.html_expand_template(template, context, result_html);
		return result_html.join("");
	},
	
	"clone_context" : function(context) {
		// return a copy of the current context
		var new_context = {
			'options':context.options,
			'globals':context.globals,
			'repeat':this.copy_object(context.repeat),
			'locals':this.copy_object(context.locals),
			'CONTEXTS':context.CONTEXTS
		};
		new_context.CONTEXTS.repeat = new_context.repeat;
		return new_context;
	},
	
	"html_expand_template" : function(template, context, result_html, repeat_inside) {
		// expand this template and children, append to result_html
		var tal_statements = template.tal_statements;

		if(!repeat_inside) {
			if(template.clone_context) // needed for tal:define or tal:repeat
				context = this.clone_context(context);

			// process tal_define here
							
			var tal_repeat = tal_statements['repeat'];
			if(tal_repeat) {
				var repeat_var = tal_repeat.repeat_var;
				var locals = context.locals;
				var repeat = context.repeat;

				var repeat_source = tal_repeat.expression(context);
				if(typeof repeat_source == 'function')
					repeat_source = repeat_source(context);
					
				// what type of iterable is it?
				if(repeat_source instanceof Array) {
					for(var i=0, l=repeat_source.length; i < l; i++) {
						locals[repeat_var] = repeat_source[i];
						repeat[repeat_var] = {
							'index':i,
							'number':i+1,
							'even':Boolean(!(i & 1)),
							'odd':Boolean((i & 1)),
							'start':Boolean((i == 0)),
							'end':Boolean((i+1 == l)),
							'length':l
						};
						
						this.html_expand_template(template, context, result_html, true);
					}
				} else if(typeof repeat_source == 'object') {
					// could be an iterator
					if(typeof repeat_source.next != 'function')  {
						if(typeof repeat_source.iter == 'function') {
							repeat_source = repeat_source.iter();
						} else if (typeof repeat_source.__iterable__ == 'function') {
							repeat_source = repeat_source.__iterable__();						
						} else {
							throw new TypeError("repeat source is not an array or iterable: "+tal_repeat.error_hint);
						}
					}
					// use next() function
					try {
						var i=0;
						do {
							locals[repeat_var] = repeat_source.next();
							repeat[repeat_var] = {
								'index':i,
								'number':i+1,
								'even':Boolean(!(i & 1)),
								'odd':Boolean((i & 1)),
								'start':Boolean((i == 0)),
								'end':null, // we never know
								'length':null // don't know this either
							};
							
							this.html_expand_template(template, context, result_html, true);
							i += 1;
						} while(true);
					
					} catch(e) {
						if(typeof StopIteration != 'undefined') 
							if(e != StopIteration)	// mochikit specific?
								throw e;
								
						// get here, StopIteration isn't known
						// we got an exception, throw it or not?
						// I guess eat it for now
					}
				}
				return;
			}
		}
		
		var node_info = template.node_info;
		var tagname = node_info.tagname;
		var close_tag = "</" +tagname + ">";
		
		// figure out which attributes get added to element
		var attrs = template.static_attributes;
		var tal_attributes = tal_statements['attributes'];
		if(tal_attributes) {
			var attributes = [];
			var expressions = tal_attributes.expressions;
			for(var i=0, l=expressions.length; i < l; i++) {
				var expression = expressions[i];
				
				// do we try/except on attributes?
				// not now, let em rip
				try {
					var attribute_value = expression.expression(context);
					if(typeof attribute_value == 'function')
						attribute_value = attribute_value(context);
				} 
				catch(e) {
					// an error occured in content, do we have an on-error?
					if(template.onerror) {
						process_child_nodes = false;
						var content = this.dispatch_error(context, template, e, 
											expression.error_hint);
						if(JAVASCRIPT_TAL_DEFAULT !== content && 
							JAVASCRIPT_TAL_NOTHING !== content) {
							result_html.push('<'+tagname+attrs+ '>');
							result_html.push(this.escape_content(content));
							result_html.push(close_tag);
						}
						return;
					} else throw e;
				}
				if(attribute_value != JAVASCRIPT_TAL_NOTHING) {
					if(attribute_value == JAVASCRIPT_TAL_DEFAULT) {
						// default, is there one?
						if(expression.default_value != undefined) {
							attributes.push(expression.attribute_name + '="' + 
												expression.default_value + '"');
						}
					} else {
						// got a value, add it
						attributes.push(expression.attribute_name + '="' + 
											attribute_value + '"');
					}
				}
			}
			if(attributes.length) {
				// add to attrs
				attrs += " " + attributes.join(' ');
			}
		}
		
		result_html.push('<'+tagname+attrs+ '>');
		var process_child_nodes = true;
		
		try {
			var tal_content = tal_statements['content'];
			if(tal_content) {
				// replace the content of this element
				// with expression result
				var tal_object = tal_content;
				var content = tal_content.expression(context);
				if(typeof content == 'function')
					content = content(context);
					
				if(content !== JAVASCRIPT_TAL_DEFAULT) {
					process_child_nodes = false;
					if(content === JAVASCRIPT_TAL_NOTHING) {
						content = '';
					} else if(!tal_content.structure) {
						// escape_content maybe?
						if(this.escape_content_match.test(content)) {
							content = this.escape_content(content);
						}
					}
					result_html.push(content);
				}
			} 
		}
		catch(e) {
			// an error occured in content, do we have an on-error?
			if(template.onerror) {
				process_child_nodes = false;
				var content = this.dispatch_error(context, template, e, template.error_hint);
				if(JAVASCRIPT_TAL_DEFAULT !== content && 
					JAVASCRIPT_TAL_NOTHING !== content) {
					result_html.push(this.escape_content(content));
				}
			} else throw e;
		}
		if(process_child_nodes) {
			var childNodes = template.childNodes;
	
			for(var i=0, l = childNodes.length; i < l; i++) {
				var child_template = childNodes[i];
				if(3 == child_template.nodeType) {	// text node
					result_html.push(child_template.nodeValue);
				} else {
					this.html_expand_template(child_template, context, result_html);
				}
			}
		}
		if(close_tag)
			result_html.push(close_tag);
	},
	"escape_content" : function(str) {
		// replace & with &amp; < with &lt; and > with &gt;
		return  String(str).replace('&', '&amp;').replace('<', '&lt;').replace('>','&gt;');
	},
	
	"compile": function() {
		// compile the source dom object
		var traceback = [];
		this.compiled_template = this.compile_element(this.template_element, 
									{},  // parent_namespace_map
									null,	// on_error_expression
									traceback
									);
	},

	"compile_element" : function(element, parent_namespace_map, 
											on_error_expression,
											traceback) {
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
		e.clone_context = false;	// true if we have to copy context when expanding template
		var node_info = this.extract_node_info(element, parent_namespace_map);
		e.node_info = node_info;
		e.traceback = traceback;	// remember traceback stack
		
		if(node_info.namespaceURI && 
			parent_namespace_map[node_info.namespaceURI] === undefined &&
			node_info.prefix) {
			e.declare_namespaces = [[node_info.namespaceURI, node_info.prefix]];
			
			// remember we're going to declare it
			parent_namespace_map[node_info.namespaceURI] = node_info.prefix;
		}

		var element_attributes = {};	// element attributes to be generated
		var tal_statements = {};	// tal attributes to be expanded

		// iterate over element template attributes
		var attributes = element.attributes;
		for(var i=0, l=attributes.length; i < l; i++) {
			var attribute = attributes[i];
			var nodeValue = attribute.nodeValue;
			if(!nodeValue || typeof nodeValue != 'string') {
				// IE returns all attributes, like onmouseup, etc
				continue;
			}
			var node_info = this.extract_node_info(attribute, parent_namespace_map);
			if((node_info.namespaceURI || '').toLowerCase() == 'http://www.w3.org/2000/xmlns/')
				continue; // ignore xmlns declaration
				
			node_info.nodeValue = nodeValue;

			if(node_info.namespaceURI != this.jstal_namespace) {
				// if a regular attribute and needs namespace decl, add it to map
				if(node_info.namespaceURI && 
					parent_namespace_map[node_info.namespaceURI] === undefined &&
					node_info.prefix) {
					e.declare_namespaces = [[node_info.namespaceURI, node_info.prefix]];
					
					// remember we're going to declare it
					parent_namespace_map[node_info.namespaceURI] = node_info.prefix;
				}
				
				element_attributes[node_info.tagname] = node_info;
			} else {
				var local_name = node_info.local_name;
				tal_statements[local_name] = node_info;
				
				if(local_name != 'attributes')
					// cannot compile attributes until all
					// attributes have been read from element
					this.compile_tal_attribute(node_info, e.node_info);
			}
		}
		// now, compile attributes if we have them
		// side effect of compiling tal:attributes is that
		// some attributes are removed from element_attributes
		if(tal_statements['attributes'])
			this.compile_tal_attribute(tal_statements['attributes'], e.node_info, 
												element_attributes);
		
		// generate fully static attributes
		var static_attributes = [];
		for(var tagname in element_attributes) {
			var attribute_node_info = element_attributes[tagname];
			static_attributes.push(attribute_node_info.tagname + 
										'="'+attribute_node_info.nodeValue + '"');
		}
		if(static_attributes.length) 
			e.static_attributes = ' ' + static_attributes.join(' ');
		else
			e.static_attributes = '';

		e.tal_statements = tal_statements;
		e.sometimes_omit_tag = false;
		
		var tal_onerror = tal_statements['on-error'];
		if(tal_onerror !== undefined && tal_onerror.expression) {
			e.onerror = on_error_expression = tal_onerror.expression;
		} else
			e.onerror = on_error_expression;
			
		if(tal_statements['define'] || tal_statements['repeat'])
			e.clone_context = true;
		
		if(tal_statements['omit-tag'] !== undefined) {
			e.sometimes_omit_tag = true;
			if(!tal_statements['omit-tag'].nodeValue) {
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
		console.debug('traceback ', traceback);
		traceback = traceback.slice(0)
		traceback.push(e.node_info.tagname + e.static_attributes);
		var childNodes = [];
		for(var node=element.firstChild; node; node=node.nextSibling) {
			if (node.nodeType == 1) {	// element
				var parent_namespace_map_copy = this.copy_object(parent_namespace_map);
				childNodes.push(this.compile_element(node, 
														parent_namespace_map_copy, 
														on_error_expression,
														traceback));
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
	
	"compile_tal_attribute" : function(node_info, parent_node_info, element_attributes) {
		var nodeValue = this.trim(node_info.nodeValue);
		var tagname = parent_node_info.tagname;
		var first_space = nodeValue.indexOf(' ');

		switch(node_info.local_name)  {
			case "repeat" :
				// expect jtal:repeat="v expression"
				if(first_space >= 0) {
					var repeat_var = nodeValue.substring(0, first_space);
					var expression = this.trim(nodeValue.substring(first_space+1));
				} 
				if(!repeat_var || !expression) {
					throw new TypeError("repeat argument malformed: "+nodeValue);
				}
				
				var error_hint = '<'+tagname +" tal:content='"+nodeValue + "' />";
				var expression_info = this.decode_expression(expression, error_hint);
				if(expression_info.type == 'string' ||
 				   expression_info.type == 'boolean') 
 				   throw new TypeError("repeat argument expression cannot be string or boolean type: "+nodeValue);
 				   
				node_info.expression = 	expression_info.expression;
				node_info.repeat_var = repeat_var;
				node_info.error_hint = error_hint;
				break;
			case "attributes":
				// attributes can consist of multiple expressions,
				// so break into expression list first
				var gerror_hint = '<'+tagname +" tal:attributes='"+nodeValue + "' />";
				var expressions = this.split_expressions(nodeValue);
				for(var i=0, l=expressions.length; i < l; i++) {
					var expression = expressions[i];
					var first_space = expression.indexOf(' ');
					if(first_space < 2) {
						throw new TypeError("attribute argument missing attribute name: " +gerror_hint);
					}
					var attribute_name = expression.substring(0, first_space);
					var error_hint = "attribute '"+attribute_name + "' in :" +gerror_hint;
					var expression = this.trim(expression.substring(first_space+1));
					var expression_info = this.decode_expression(expression, 
										error_hint);
					
					var default_value = element_attributes[attribute_name];
					expressions[i] = {
						'expression':expression_info.expression,
						'attribute_name':attribute_name,
						'default_value':default_value ? default_value.nodeValue : null,
						'error_hint':error_hint
					};
					if(default_value) 	// remove from static elements
						delete element_attributes[attribute_name];
				}
				node_info.expressions = expressions;
				node_info.error_hint = gerror_hint;
				break;
			case "content" :
				var error_hint = '<'+tagname +" tal:content='"+nodeValue + "' />";
				node_info.structure = false;
				if(0 == nodeValue.indexOf('structure ')) {
					var structure_flag = nodeValue.substring(0, first_space);
					nodeValue = this.trim(nodeValue.substring(first_space+1));
					node_info.structure = true;
				} 
				
				var expression_info = this.decode_expression(nodeValue, error_hint);
				node_info.expression = 	expression_info.expression;
				node_info.error_hint = error_hint;
				break;
			case "on-error" :
				var error_hint = '<'+tagname +" tal:on-error='"+nodeValue + "' />";
				var expression_info = this.decode_expression(nodeValue, error_hint);
				node_info.expression = 	expression_info.expression;
				node_info.error_hint = error_hint;
				break;
		}
	},
	
	"trim" : function(s) {
		// trim leading and trailing whitespace
		return s.replace(/^\s+|\s+$/g,'');
	},
	"split_expressions" : function(s) {
		// return list of expressions
		// breaking on single semi-colon, but not breaking
		// on double semi-colon (replace those with single-colon
		// trims all expressions
		var double_colon = /;;/mg;
		var temp_marker = String.fromCharCode(1);
		s = s.replace(double_colon, temp_marker);
		var expressions = s.split(';');
		for(var i=0, l=expressions.length; i < l; i++) {
			var expression = expressions[i].replace(temp_marker, ';')
			expressions[i] = this.trim(expression);
		}
		return expressions;
	},
	
	"extract_node_info" : function(node, parent_namespace_map) {
		// extract localname, prefix and namespace
		// declarations. 
		// namespace_map is a mapping of namespaces already declared
		// by a parent node
		var namespaceURI = node.namespaceURI;
	
		if(!node.localName) {
			// could be stupid IE
			var local_name =  node.nodeName;
			var colon = local_name.indexOf(':');
			if(-1 != colon) {
				var prefix = local_name.substring(0, colon);
				local_name = local_name.substring(colon+1);
				if(!namespaceURI) {
					// temporary workaround for IE not supporting
					// namespaceURI
					namespaceURI = this.prefix_to_namespace_map[prefix];
				}
			} else
				var prefix = null;
		} else {
			var local_name = node.localName;
			var prefix = node.prefix || null;
		}
		if(parent_namespace_map[namespaceURI])
			prefix = parent_namespace_map[namespaceURI]; // use parent's prefix
			
		if(prefix)
			var tagname = prefix + ':' + local_name;
		else
			var tagname = local_name;
			
		return  {
			"local_name":local_name,
			"prefix":prefix,
			"namespaceURI":namespaceURI,
			"tagname":tagname
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
		
		var expression_type = null;
		if(0 == expression_text.indexOf('string:')) {
			// a string expression
			expression_text = this.trim(expression_text.substr(7));
			var expression = this.compile_string_expression(expression_text,error_hint);
			expression_type = 'string';
		} else if(0 == expression_text.indexOf('javascript:')) {
			// a string expression
			expression_text = this.trim(expression_text.substr(11));
			var expression = this.compile_javascript_expression(expression_text,error_hint);
			expression_type = 'javascript';
		} else if(0 == expression_text.indexOf('path:')) {
			// a string expression
			expression_text = this.trim(expression_text.substr(5));
			var expression = this.compile_string_expression(expression_text,error_hint);
			expression_type = 'path';
		} else {
			// default to path
			var expression = this.compile_path_expression(expression_text, error_hint);
			expression_type = 'path';
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
			expression_type = 'boolean';
			expession = negate;
		} 
		return {'expression':expression,
			    'type':expression_type
			    };
	},

	"compile_string_expression" : function(expression_text, error_hint) {
		// generates a function object that returns evaluated string
		// for now, just return the text

		var function_text = [];
		function_text.push('return "'+expression_text+'";');

		function_text = function_text.join("\n");
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
			var terminal = terminals[i].match(match);
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
				} else if (steps[0] == 'CONTEXTS') {
					// lookup in CONTEXTS, not locals or globals
					function_text.push('var c = context.CONTEXTS;'); // establish current context
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
		return new Function('context', function_text);
	},
	
	"copy_object": function(obj) {
		// returns a shall copy of the object
		var o = {};
		for(var s in obj) {
			o[s] = obj[s];
		}
		return o;
	},

	"dispatch_error" : function(context, template, e, extra_error_info) {
		if(template.onerror) {
			var error_context = this.clone_context(context);
			var error = {
				'type':'exception',
				'value':e,
				'template':template,
				'error_hint':extra_error_info
			}
			
			// format a nice traceback message
			var exception_message = e.message | e.description | 'unknown';
			var exception_name = e.name | 'unknownType';
			var traceback = "Exception Type:"+exception_name + "\nException Message: "+exception_message+"\n";
			if(extra_error_info)
				traceback += extra_error_info;
			if(template.traceback) {
				traceback += "Traceback:\n"
				for(var i=0, l=template.traceback.length; i < l; i++) {
					var tb = template.traceback[i];
					var indent = "                     ".substring(0, i*4);
					traceback += indent + "<"+tb + " >\n";
				}
			}
			error.traceback = traceback;
			error_context.locals.error = error;
			return  this.escape_content(template.onerror(error_context));
		} else throw e;
	}	
}