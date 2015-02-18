/**
 * Class for storing a single chunk
 * @name FileRunChunk
 * @param {FileRun} frObj
 * @param {FileRunFile} fileObj
 * @param {number} offset
 * @constructor
 */
function FileRunChunk(frObj, fileObj, offset) {

	/**
	 * Reference to parent FileRun object
	 * @type {FileRun}
	 */
	this.frObj = frObj;

	/**
	 * Reference to parent FileRunFile object
	 * @type {FileRunFile}
	 */
	this.fileObj = fileObj;

	/**
	 * File size
	 * @type {number}
	 */
	this.fileObjSize = fileObj.size;

	/**
	 * File offset
	 * @type {number}
	 */
	this.offset = offset;

	/**
	 * Number of retries performed
	 * @type {number}
	 */
	this.retries = 0;

	/**
	 * Pending retry
	 * @type {boolean}
	 */
	this.pendingRetry = false;

	/**
	 * Bytes transferred from total request size
	 * @type {number}
	 */
	this.loaded = 0;

	/**
	 * Total amount of bytes from the chunk transferred until the last progress call
	 * @type {number}
	 */
	this._lastLoaded = 0

	/**
	 * Total request size
	 * @type {number}
	 */
	this.total = 0;

	/**
	 * Chunk start byte in a file
	 * @type {number}
	 */
	if (this.frObj.opts.chunkSize) {
		this.startByte = fileObj.offset + (this.offset * this.frObj.opts.chunkSize);
	} else {
		this.startByte = 0;
	}

	/**
	 * Chunk end byte in a file
	 * @type {number}
	 */
	if (this.frObj.opts.chunkSize) {
		this.endByte = Math.min(this.fileObjSize, this.startByte + this.frObj.opts.chunkSize);
	} else {
		this.endByte = this.fileObjSize;
	}

	/**
	 * The size of this chunk
	 * @type {number}
	 */
	this.size = this.endByte - this.startByte;

	/**
	 * XMLHttpRequest
	 * @type {XMLHttpRequest}
	 */
	this.xhr = null;


	var $ = this;

	/**
	 * Catch progress event
	 * @param {ProgressEvent} event
	 */
	this.progressHandler = function(event) {
		if (event.lengthComputable) {
			$.loaded = Math.min(event.loaded, $.size);
			$.total = Math.min(event.total, $.size);
			if ($.loaded > $._lastLoaded) {
				var loadedNow = $.loaded-$._lastLoaded;
				$.fileObj.completedBytes += loadedNow;
				$.frObj.completedBytes += loadedNow;
			}
			$._lastLoaded = $.loaded;
		}
		$.fileObj.chunkEvent('progress');
	};

	/**
	 * Upload has stopped
	 * @param {Event} event
	 */
	this.doneHandler = function(event) {
		var status = $.status();
		var message = $.message();
		if (status === 'success') {
			$.retries = 0;
			$.fileObj.completedChunks++;
			$.fileObj.chunkEvent('success', message);
		} else {
			$.fileObj.uploadingChunk = false;
			$.abort();
			if (status === 'error') {//permanent error
				$.retries = 0;
				$.fileObj.chunkEvent('error', message);
			} else {
				if ($.retries < $.frObj.opts.maxChunkRetries) {
					$.retries++;
					var retryInterval = $.frObj.opts.chunkRetryInterval;
					if (retryInterval !== null) {
						if ($.retries > 1) {//increase the wait time between the successive retries
							retryInterval = retryInterval*$.retries;
						}
						setTimeout(function () {
							$.send();
						}, retryInterval);
					} else {
						$.send();
					}
				} else {
					$.retries = 0;
					//the same as permanent error above
					$.fileObj.chunkEvent('error', message);
				}
			}
		}
	};
}

FileRunChunk.prototype = {
	/**
	 * Get params for a request
	 * @function
	 */
	getParams: function () {
		var params = {
			frTotalSize: this.fileObjSize,
			frIsFirstChunk: (this.startByte == 0) ? 1:0,
			frIsLastChunk: (this.endByte == this.fileObjSize) ? 1:0
		};
		if (this.fileObj.relativePath) {
			params.frRelativePath = this.fileObj.relativePath;
		}
		if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
			params.frFilename = this.fileObj.name;
		}
		return params;
	},

	/**
	 * Get target option with query params
	 * @function
	 * @param params
	 * @returns {string}
	 */
	getTarget: function(params){
		var target = this.frObj.opts.target;
		if(target.indexOf('?') < 0) {
			target += '?';
		} else {
			target += '&';
		}
		return target + params.join('&');
	},

	/**
	 * Uploads the actual data in a POST call
	 * @function
	 */
	send: function () {
		this.fileObj.uploadingChunk = this;
		this.loaded = 0;
		this._lastLoaded = 0;
		this.total = 0;
		this.pendingRetry = false;

		var func = (this.fileObj.file.slice ? 'slice' :
			(this.fileObj.file.mozSlice ? 'mozSlice' :
				(this.fileObj.file.webkitSlice ? 'webkitSlice' :
					'slice')));
		var bytes = this.fileObj.file[func](this.startByte, this.endByte);

		// Set up request and listen for event
		this.xhr = new XMLHttpRequest();
		this.xhr.upload.addEventListener('progress', this.progressHandler, false);
		this.xhr.addEventListener("load", this.doneHandler, false);
		this.xhr.addEventListener("error", this.doneHandler, false);

		var data = this.prepareXhrRequest(bytes);
		this.xhr.send(data);
	},

	/**
	 * Abort current xhr request
	 * @function
	 */
	abort: function () {
		if (this.xhr) {
			this.xhr.abort();
			if (this.loaded) {
				//subtract the pending load
				this.fileObj.completedBytes -= this.loaded;
				this.frObj.completedBytes -= this.loaded;
			}
		}
		this.fileObj.chunkEvent('abort');
	},

	/**
	 * Retrieve current chunk upload status
	 * @function
	 * @returns {string} 'pending', 'uploading', 'success', 'error'
	 */
	status: function () {
		if (this.pendingRetry) {
			// if pending retry then that's effectively the same as actively uploading,
			// there might just be a slight delay before the retry starts
			return 'uploading';
		} else if (!this.xhr) {
			return 'pending';
		} else if (this.xhr.readyState < 4) {
			// Status is really 'OPENED', 'HEADERS_RECEIVED'
			// or 'LOADING' - meaning that stuff is happening
			return 'uploading';
		} else {
			return this.frObj.opts.validateChunkResponse.call(this.frObj.opts.validateChunkResponseScope || this, this.xhr.status, this.xhr.responseText);
		}
	},

	/**
	 * Get response from xhr request
	 * @function
	 * @returns {String}
	 */
	message: function () {
		return this.xhr ? this.xhr.responseText : '';
	},

	/**
	 * Prepare Xhr request. Set query, headers and data
	 * @param {string} [paramsMethod] octet or form
	 * @param {Blob} [blob] to send
	 * @returns {FormData|Blob|Null} data to send
	 */
	prepareXhrRequest: function(blob) {
		// Add data from the query options
		var query = this.frObj.opts.query;
		if (typeof query === "function") {
			query = query(this.fileObj, this);
		}
		query = this.frObj.extend(this.getParams(), query);
		// Add data from the query options
		var data = new FormData();
		this.frObj.each(query, function (v, k) {
			data.append(k, v);
		});
		data.append(this.frObj.opts.fileParameterName, blob, this.fileObj.name);
		this.xhr.open('POST', this.frObj.opts.target);
		this.xhr.withCredentials = this.frObj.opts.withCredentials;
		// Add data from header options
		this.frObj.each(this.frObj.opts.headers, function (v, k) {
			this.xhr.setRequestHeader(k, v);
		}, this);

		return data;
	}
};