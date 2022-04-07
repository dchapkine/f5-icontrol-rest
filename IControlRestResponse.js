
const fs = require('fs');
const urlmod = require('url');
const request = require('request');
const validator = require('validator');


/**
 * IControl REST Api Response object
 */
class IControlRestResponse {
	constructor(params) {
		const {request, data, client} = params;
		this.request = request;
		this.data = data;
		this.client = client;
	}

	/**
	 * Iterate through data attributes and retrieve reference values from API
	 *
	 * "expandSubcollections" query parameter doesn't support expanding on anything other than GET requests.
	 * This method expands manualy
	 */
	async expand(data) {
		data = data || this.data;
		const cli = this.client;
		for (const key in  data) {
			console.log("key = ", key);
			const val = this.data[key];
			/*if (key == "selfLink") {
				const url = urlmod.parse(val, true);
				const uri = `${url.pathname}${url.search}`;
				console.log(uri);
				const expanded = await cli.request({method: 'GET', uri: uri, ignoreTransaction: true});
				const expandedData = expanded.data;
				this.data["self"] = expandedData;
			} else*/ if (key.endsWith("Reference") && val && val.link !== undefined) {
				const url = urlmod.parse(val.link, true);
				const uri = `${url.pathname}${url.search}`;
				console.log(uri);
				const expanded = await cli.request({method: 'GET', uri: uri, ignoreTransaction: true});
				const expandedData = expanded.data;
				const newKey = key.substr(0, key.length - "Reference".length);
				data[newKey] = expandedData;
			}
		}
	}
}

module.exports = IControlRestResponse;