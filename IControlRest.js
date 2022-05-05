
const fs = require('fs');
const urlmod = require('url');
const request = require('request');
const validator = require('validator');

const IControlRestClient = require('./IControlRestClient');



/**
 * iControl Rest API module
 *
 * @param {Object} { url:string, user:string, pass:string, [strict:bool], [logger:Object] }
 */
const iControlRest = (params) => {
	params = params || {};

	// check required params
	if (params.url === undefined) {
		throw new Error("Bad params, url is missing");
	} else if (!validator.isURL(params.url)) {
		throw new Error("Bad params, url is invalid");
	} else if (params.url.endsWith("/")) {
		throw new Error("Bad params, url can NOT end with a /");
	} else if (params.user === undefined) {
		throw new Error("Bad params, user is required");
	} else if (params.pass === undefined) {
		throw new Error("Bad params, pass is required");
	}

	// set default values for optional params
	params.strict = !!params.strict;
	params.logger = params.logger || null;

	/**
	 * Returns new icontrol rest api client in transaction mode
	 *
	 * @return {IControlRestTransactionClient} api client in transaction mode
	 */
	async function transaction() {
		return await this.client().beginTransaction();
	}

	/**
	 * Returns new icontrol rest api
	 *
	 * @param {Object} options - request options
	 * @return {IControlRestClient} api client
	 */
	function client(options) {
		return new IControlRestClient(params, options);
	}

	return {
		transaction,
		client
	};
};


module.exports = iControlRest;
