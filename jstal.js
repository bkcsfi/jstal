// jstal.js - javascript implementation of TAL
// runs on the client

jsTalTemplate = function(attr) {
	this.template_element = attr.dom_element;
	if(!this.template_element) 
	    throw new TypeError("dom_element must be define");
	    
}

jsTalTemplate.prototype = {

	"apply_tal": function(context) {
		// expand the template and
		// return the expanded results
		// context is an object containing the
		// root context
		
		return null;
	}

}