const fs = require('fs');
const urlmod = require('url');
const request = require('request');
const validator = require('validator');

const IControlRestError = require(`${__dirname}/IControlRestError`);
const IControlRestResponse = require(`${__dirname}/IControlRestResponse`);

/**
 * IControl REST Api client
 */
class IControlRestClient {

	/**
	 * Ctor
	 *
	 * @param {Object} options - request options
	 * @param {Object} params
	 */
	constructor(params, options) {
		this.params = params;
		this.options = options || {};
		this.transactionId = null;
	}

	/**
	 * Manualy sets transaction ID
	 * ** use this if you know what you are doing **
	 *
	 * @param {String} transaction id
	 * @return {IControlRestClient}
	 */
	setTransactionId(tid) {
		this.transactionId = tid;
		return this;
	}

	/**
	 * Returns transaction id, or throws if client not in transaction mode
	 *
	 * @return {String}
	 */
	getTransactionId() {
		if (!this.isInTransactionMode()) throw new Error("Bad operation, client is not in transaction mode");
		return this.transactionId;
	}

	/**
	 * Is this client in transaction mode
	 *
	 * In transaction mode, icontrol API requires us to pass a "X-F5-REST-Coordination-Id" header
	 * to scope request as part of transaction
	 */
	isInTransactionMode() {
		return this.transactionId !== null;
	}

	/**
	 * Generic method to request iControl REST API
	 *
	 * @param {String} http method
	 * @param {String} uri
	 * @param {Object|undefined} data
	 *
	 * @return {Promise}
	 */
	async request(reqParams) {
		const client = this;
		const {method, uri, data, ignoreTransaction} = reqParams;
		const params = this.params;
		const headers = {};
		let options = {};
		if (this.transactionId && ignoreTransaction !== true) {
			headers['X-F5-REST-Coordination-Id'] = this.transactionId;
		}
		options.method = method;
		options.url = `${params.url}${uri}`;
		options.auth = {
			user: params.user,
			pass: params.pass
		};
		options.headers = headers;
		options.timeout = 2000;
		options.json = true;
		options.strictSSL = params.strict;
		if (data) {
			options.body = data;
		}
		// optional: override request options
		options = Object.assign({}, options, this.options);

		return new Promise((resolve, reject) => {
			request(options, (e, r, obj) => {
			  if (e) {
					reject(new IControlRestError({message: e.message, client: client}));
				} else if (r.statusCode && r.statusCode != 200) {
					// console.log(obj);
					reject(new IControlRestError({message: obj.message, httpStatus: r.statusCode, client: client}));
				} else {
					resolve(new IControlRestResponse({request: r, data: obj, client: client}));
				}
			});
		});
	}


	/**
	 * Create new transaction and switch this client into transaction mode
	 *
	 * "You'll need the transId to add or re-sequence commands within the transaction, and the transaction will expire after 30 seconds if no commands are added. You can list all transactions, or the details of a specific transaction with a get request."
	 * https://devcentral.f5.com/articles/demystifying-icontrol-rest-part-7-understanding-transactions-21404
	 *
	 * @return IControlRestTransactionClient
	 */
	async beginTransaction() {
		if (this.isInTransactionMode()) throw new Error("Bad operation, client is already in transaction mode");
		const res = await this.request({method: 'POST', uri: `/mgmt/tm/transaction`, data: {}});
		this.transactionId = res.data.transId;
		/*
		res.data:
		{ transId: 14567789009876543,
		  state: 'STARTED',
		  timeoutSeconds: 120,
		  asyncExecution: false,
		  validateOnly: false,
		  executionTimeout: 300,
		  executionTime: 0,
		  failureReason: '',
		  kind: 'tm:transactionstate',
		  selfLink: 'https://localhost/mgmt/tm/transaction/14567789009876543?ver=13.1.1.2' }
		*/
		return this;
	}

	/**
	 * Commit the transaction
	 *
	 * @return {Promise}
	 */
	async commitTransaction() {
		if (!this.isInTransactionMode()) throw new Error("Bad operation, client is not in transaction mode");
		const transactionId = `${this.transactionId}`;
		this.transactionId = null;
		const ret = this.request({method: 'PATCH', uri: `/mgmt/tm/transaction/${transactionId}`, data: { state: "VALIDATING" }});
		/*
		ret.data:
	   { transId: 14567789009876543,
	     state: 'COMPLETED',
	     timeoutSeconds: 120,
	     asyncExecution: false,
	     validateOnly: false,
	     executionTimeout: 300,
	     executionTime: 0,
	     failureReason: '',
	     kind: 'tm:transactionstate',
	     selfLink: 'https://localhost/mgmt/tm/transaction/14567789009876543?ver=13.1.1.2' },
		*/
		return ret;
	}

	/**
	 * Delete the transaction
	 *
	 * @return {Promise}
	 */
	async rollbackTransaction(transactionId) {
		if (this.isInTransactionMode()) throw new Error("Bad operation, client is in transaction mode");
		//const transactionId = this.transactionId;
		//this.transactionId = null;
		return this.request({method: 'DELETE', uri: `/mgmt/tm/transaction/${transactionId}`});
	}

	/**
	 * Returns the name of the transaction state
	 *
	 * transaction states: STARTED|UPDATING|VALIDATING|COMPLETED|FAILED
	 */
	async getTransactionState() {
		// TODO
		// this.request("GET", `/mgmt/tm/transaction/${this.transactionId}`)
	}

	/**
	 * Get list of all commands in the transaction
	 *
	 * @return {Promise}
	 */
	async getTransactionCommands() {
		return this.request({method: 'GET', uri: `/mgmt/tm/transaction/${this.transactionId}/commands`});
	}

	/**
	 * Enable/Disable autoexpand feature
	 *
	 * @param {Boolean} b
	 * @return {IControlRestClient}
	 */
	autoExpand(b) {
		this._autoExpandCollections = !!b;
		return this;
	}

	/**
	 * Create a pool on LTM
	 *
	 * @param {Object} datas
	 * @return {Promise}
	 */
	async ltmCreatePool(datas) {
		return this.request({method: 'POST', uri: "/mgmt/tm/ltm/pool", data: datas});
	}

	/**
	 * updated a pool on LTM
	 *
	 * @param {Object} datas
	 * @return {Promise}
	 */
	async ltmUpdatePool(poolName, datas) {
		return this.request({method: 'PATCH', uri: `/mgmt/tm/ltm/pool/${poolName}`, data: datas});
	}

	/**
	 * Create a pool on LTM
	 *
	 * @param {Object|undefined} datas
	 * @return {Promise}
	 *//*
	async ltmCreateVirtualAddress(datas) {
		return this.request({method: 'POST', uri: "/mgmt/tm/ltm/pool", data: datas});
	}*/


	/**
	 * Retrieves a pool by name
	 *
	 * @param {String} name
	 * @return {Promise}
	 */
	async ltmGetPool(name) {
		const autoExpand = this._autoExpandCollections === true ? 'expandSubcollections=true' : 'expandSubcollections=false';
		return this.request({method: 'GET', uri: `/mgmt/tm/ltm/pool/${name}?${autoExpand}`});
	}


	/**
	 * Retrieves a pool members by pool name
	 *
	 * @param {String} name
	 * @return {Promise}
	 */
	async ltmGetPoolMembers(name) {
		const autoExpand = this._autoExpandCollections === true ? 'expandSubcollections=true' : 'expandSubcollections=false';
		return this.request({method: 'GET', uri: `/mgmt/tm/ltm/pool/${name}/members?${autoExpand}`});
	}

	/**
	 * Get GTM pool

	 { kind: 'tm:ltm:virtual:virtualstate',
     name: 'MY_POOL_NAME',
     fullPath: 'MY_POOL_NAME',
     generation: 1,
     selfLink: 'https://localhost/mgmt/tm/ltm/virtual/MY_POOL_NAME?expandSubcollections=false&ver=13.1.1.2',
     addressStatus: 'yes',
     autoLasthop: 'default',
     cmpEnabled: 'yes',
     connectionLimit: 0,
     destination: '/Common/1.1.1.1:443',
     enabled: true,
     gtmScore: 0,
     ipProtocol: 'tcp',
     mask: '255.255.255.255',
     mirror: 'disabled',
     mobileAppTunnel: 'disabled',
     nat64: 'disabled',
     pool: '/Common/MY_POOL_NAME2',
     poolReference:
      { link: 'https://localhost/mgmt/tm/ltm/pool/~Common~MY_POOL_NAME2?ver=13.1.1.2' },
     rateLimit: 'disabled',
     rateLimitDstMask: 0,
     rateLimitMode: 'object',
     rateLimitSrcMask: 0,
     serviceDownImmediateAction: 'none',
     source: '0.0.0.0/0',
     sourceAddressTranslation: { type: 'automap' },
     sourcePort: 'preserve',
     synCookieStatus: 'not-activated',
     translateAddress: 'enabled',
     translatePort: 'enabled',
     vlansDisabled: true,
     vsIndex: 200,
     persist: [ [Object] ],
     policiesReference:
      { link: 'https://localhost/mgmt/tm/ltm/virtual/~Common~MY_POOL_NAME/policies?ver=13.1.1.2',
        isSubcollection: true },
     profilesReference:
      { link: 'https://localhost/mgmt/tm/ltm/virtual/~Common~MY_POOL_NAME/profiles?ver=13.1.1.2',
        isSubcollection: true }
    }
	 */
	async gtmGetVirtual(name) {
		const autoExpand = this._autoExpandCollections === true ? 'expandSubcollections=true' : 'expandSubcollections=false';
		return this.request({method: 'GET', uri: `/mgmt/tm/ltm/virtual/${name}?${autoExpand}`});
	}

	/**
	 * Retrieves all monitors
	 *
	 * @param {String} type
	 * @return {Promise}
	 */
	async ltmGetMonitorsByType(type) {
		const autoExpand = this._autoExpandCollections === true ? 'expandSubcollections=true' : 'expandSubcollections=false';
		return this.request({method: 'GET', uri: `/mgmt/tm/ltm/monitor/${type}?${autoExpand}`});
	}


	/**
	 * Create a pool on LTM
	 *
	 * @param {Object} datas
	 * @return {Promise}
	 */
	async ltmCreateVirtual(datas) {
		return this.request({method: 'POST', uri: "/mgmt/tm/ltm/virtual", data: datas});
	}

	async ltmCreateVirtualAddress(datas) {
		return this.request({method: 'POST', uri: "/mgmt/tm/ltm/virtual-address", data: datas});
	}

	async ltmCreateMonitor(datas) {
		if (datas.defaultsFrom) {
			// TODO: implement better extraction method
			const arr = datas.defaultsFrom.split('/').reverse();
			const parentMonitor = arr[0];
			return this.request({method: 'POST', uri: `/mgmt/tm/ltm/monitor/${parentMonitor}`, data: datas});
		} else {
			return Promise.reject("ltmCreateMonitor requires parent monitor (data.defaultsFrom");
		}
	}

  /**
   *
   */
  async ltmUpdateMonitor(parentType, name, datas) {
		return this.request({method: 'PATCH', uri: `/mgmt/tm/ltm/monitor/${parentType}/${name}`, data: datas});
  }

	async ltmCreatePolicy(datas) {
		return this.request({method: 'POST', uri: "/mgmt/tm/ltm/policy", data: datas});
	}

	async ltmPublishPolicy(policyDraftName) {
		return this.request({method: 'POST', uri: "/mgmt/tm/ltm/policy", data: {command: "publish", name: policyDraftName}});
	}

	escapeResourcePath(path) {
		return path.split('/').join('~');
	}

	resourcePathToName(path) {
		const arr = path.split('/').reverse();
		return arr[0];
	}

	async ltmCreatePolicyRule(policyName, datas) {
		//const _policyPath = this.escapeResourcePath(policyPath);
		return this.request({method: 'POST', uri: `/mgmt/tm/ltm/policy/${policyName}/rules`, data: datas});
	}

	async gtmCreateWideIp(wideIpType, datas) {
		return this.request({method: 'POST', uri: `/mgmt/tm/gtm/wideip/${wideIpType}`, data: datas});
	}

	/**
	 * Create gtm pool and attach it to existing wideip
	 */
	async gtmCreatePool(poolType, datas) {
		return this.request({method: 'POST', uri: `/mgmt/tm/gtm/pool/${poolType}`, data: datas});
	}
}


module.exports = IControlRestClient;
