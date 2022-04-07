/**
 * IControl REST Api Error
 */
class IControlRestError extends Error {
	constructor(params) {
		const {message, httpStatus, client} = params;
		super(message);
		this.httpStatus = httpStatus;
	}
}

module.exports = IControlRestError;
