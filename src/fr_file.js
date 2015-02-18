/**
 * FileRunFile class
 * @name FileRunFile
 * @param {FileRun} frObj
 * @param {File} file
 * @constructor
 */
function FileRunFile(frObj, file) {

	/**
	 * Reference to parent FileRun instance
	 * @type {FileRun}
	 */
	this.frObj = frObj;

	/**
	 * Reference to file
	 * @type {File}
	 */
	this.file = file;

	/**
	 * File name. Some confusion in different versions of Firefox
	 * @type {string}
	 */
	this.name = file.fileName || file.name;

	/**
	 * File size
	 * @type {number}
	 */
	this.size = file.size;

	/**
	 * Relative file path
	 * @type {string}
	 */
	this.relativePath = file.relativePath || file.webkitRelativePath || false;
	if (this.relativePath && this.relativePath != this.name) {
		baseNameStartPos = this.relativePath.length-this.name.length;
		var baseName = this.relativePath.substring(baseNameStartPos);
		if (baseName == this.name) {
			this.relativePath = this.relativePath.substring(0, baseNameStartPos);
		}
	}

	/**
	 * File unique identifier
	 * @type {string}
	 */
	this.uniqueIdentifier = frObj.generateUniqueIdentifier(file);

	this.offset = 0;

	/**
	 * List of chunks
	 * @type {Array.<FileRunChunk>}
	 */
	this.chunks = [];

	/**
	 * The chunk that is currently uploading
	 * @type {<FileRunChunk>}
	 */
	this.uploadingChunk = false;

	/**
	 * Number of chunks that were successfully uploaded
	 * @type {number}
	 */
	this.completedChunks = 0;

	/**
	 * Number of bytes that were successfully uploaded
	 * @type {number}
	 */
	this.completedBytes = 0;
	this.lastCompletedBytes = 0;//file size might change between pausing and resuming, this is being used to adjust the queue progress accordingly

	/**
	 * Indicates that the file has been successfully uploaded
	 * @type {boolean}
	 */
	this.complete = false;

	/**
	 * Indicates that the file is currently processing
	 * @type {boolean}
	 */
	this.uploading = false;


	/**
	 * Indicated if file is paused
	 * @type {boolean}
	 */
	this.paused = false;

	/**
	 * Indicated the current progress status
	 * @type {float}
	 */
	this.progress = 0;

	/**
	 * Indicated if file is paused in the queue
	 * @type {boolean}
	 */
	this.queuePaused = false;

	/**
	 * Indicated if file has encountered an error
	 * @type {boolean}
	 */
	this.error = false;

	/**
	 * Average upload speed
	 * @type {number}
	 */
	this.averageSpeed = 0;

	/**
	 * Current upload speed
	 * @type {number}
	 */
	this.currentSpeed = 0;

	/**
	 * Date then progress was called last time
	 * @type {number}
	 * @private
	 */
	this._lastProgressCallback = Date.now();

	/**
	 * Previously transferred amount, just for speed measurement
	 * @type {number}
	 * @private
	 */
	this._prevTransferredSize = 0;
}

FileRunFile.prototype = {
	/**
	 * Update speed parameters
	 * @link http://stackoverflow.com/questions/2779600/how-to-estimate-download-time-remaining-accurately
	 * @function
	 */
	measureSpeed: function () {
		var timeSpan = Date.now() - this._lastProgressCallback;
		if (!timeSpan) {
			return ;
		}
		var smoothingFactor = this.frObj.opts.speedSmoothingFactor;
		// Prevent negative upload speed after file upload resume
		this.currentSpeed = Math.max((this.completedBytes - this._prevTransferredSize) / timeSpan * 1000, 0);
		this.averageSpeed = smoothingFactor * this.currentSpeed + (1 - smoothingFactor) * this.averageSpeed;
		this.frObj.averageSpeed = this.averageSpeed;
		this._prevTransferredSize = this.completedBytes;
	},

	/**
	 * For internal usage only.
	 * Callback when something happens within the chunk.
	 * @function
	 * @param {string} event can be 'progress', 'success', 'error', 'retry' or 'abort'
	 * @param {string} [serverReply]
	 */
	chunkEvent: function (event, serverReply) {
		switch (event) {
			case 'progress':
				if (Date.now() - this._lastProgressCallback <
					this.frObj.opts.progressCallbacksInterval) {
					break;
				}
				this.reportProgress();
				break;
			case 'error':
				this.error = true;
				this.paused = true;
				//pause everything, as the user interaction should be needed if one file transfer fails
				this.frObj.paused = true;
				//update progress from queue if the file get completely removed
				//also when file doesn't have an uploading chunk
				this.frObj.completedBytes -= this.completedBytes;
				this.completedBytes = 0;
				this.reset();
				this.frObj.onFileError(this, serverReply);
				break;
			case 'success':
				this.error = false;
				this.paused = false;
				this.removeUploadingChunk(this.uploadingChunk);//free-up memory
				if (this.completedChunks == this.chunks.length) { //All chunks completed
					this.reportProgress();
					this.uploading = false;
					this.complete = true;
					this.currentSpeed = 0;
					this.averageSpeed = 0;
					this.frObj.onFileSuccess(this, serverReply);
					this.file = null;//free-up memory
				} else {
					this.uploadNextChunk();
				}
				break;
			case 'retry':
				this.frObj.fire('fileRetry', this);
				break;
		}
	},


	reportProgress: function() {
		this.measureProgress();
		this.measureSpeed();
		this.frObj.fire('fileProgress', this);
		this.frObj.fire('progress', this.frObj);
		this._lastProgressCallback = Date.now();
	},


	/**
	 * Upload next chunk
	 * @function
	 */
	uploadNextChunk: function() {
		if (!this.paused) {
			this.frObj.each(this.chunks, function(chunk) {
				if (chunk && chunk.status() === 'pending') {
					chunk.send();
					return false;
				}
			});
		}
	},

	/**
	* Catch getOffset event
	* @param {Event} event
	*/
	getOffsetHandler: function(event) {
		this.offset = 0;
		var status = this.xhr.status;
		var message = this.xhr.responseText;
		this.xhr = null;
		var proceed = this.frObj.opts.validateGetOffsetResponse.call(this.frObj.opts.validateGetOffsetResponseScope || this, this, status, message);
		if (proceed) {
			this.lastCompletedBytes = this.completedBytes;
			this.completedBytes = this.offset;
			if (this.lastCompletedBytes > 0) {
				//it means this file's upload started before this session
				//remove what have been recorded as progress before and add the actual progress reported by the server
				this.frObj.completedBytes -= this.lastCompletedBytes;
			}
			this.frObj.completedBytes += this.offset;
			this.prepareChunks();
			this.uploadNextChunk();
		} else {
			this.error = true;
			this.uploading = false;
			this.frObj.onFileError(this, message);
		}
	},

	/**
	 * Check server for already uploaded data
	 * @function
	 */
	getOffset: function () {
		// Set up request and listen for event
		this.xhr = new XMLHttpRequest();
		this.xhr.addEventListener("load", this.getOffsetHandler.bind(this), false);
		this.xhr.addEventListener("error", this.getOffsetHandler.bind(this), false);
		// Add data from the query options
		var query = this.frObj.opts.query;
		if (typeof query === "function") {
			query = query(this);
		}
		var additionalData = {
			frGetOffset: 1,
			frTotalSize: this.size,
			frFilename: this.name
		};
		if (this.relativePath) {
			additionalData.frRelativePath = this.relativePath;
		}
		query = this.frObj.extend(additionalData, query);

		var target = this.frObj.opts.target;
		// Add data from the query options
		var data = new FormData();
		this.frObj.each(query, function (v, k) {
			data.append(k, v);
		});
		this.xhr.open('POST', target);
		this.xhr.withCredentials = this.frObj.opts.withCredentials;
		// Add data from header options
		this.frObj.each(this.frObj.opts.headers, function (v, k) {
			this.xhr.setRequestHeader(k, v);
		}, this);
		this.xhr.send(data);
	},

	reset: function() {
		//we do not reset "completedBytes" as it is needed between resumes for progress reporting
		this.paused = false;
		this.queuePaused = false;
		this.uploading = false;
		this.currentSpeed = 0;
		this.averageSpeed = 0;
		this.offset = 0;
		this.uploadingChunk = false;
		this.completedChunks = 0;
		this.chunks = [];
	},

	/**
	 * Pause file upload
	 * @function
	 * @param {boolean} pauseInTheQueue - if true, the file will be skipped in the queue
	 */
	pause: function(pauseInTheQueue) {
		if (this.complete) {return false;}
		var fileWasUploading;
		if (this.uploading) {
			if (this.uploadingChunk) {
				this.uploadingChunk.abort();
			}
			fileWasUploading = true;
		}
		this.reset();
		if (pauseInTheQueue) {
			this.queuePaused = true;
		}
		this.paused = true;
		this.frObj.onFilePause(this, pauseInTheQueue, fileWasUploading);
	},

	/**
	 * Start file upload
	 * @function
	 */
	start: function() {
		if (this.complete) {return false;}
		this.reset();
		this.uploading = true;
		this.frObj.onFileStart();
		if (!this.frObj.opts.chunkSize ||
			(this.size < this.frObj.opts.chunkSize &&
			this.size < this.frObj.opts.resumeLargerThan)) {
			//file is small, don't use resuming
			this.prepareChunks();
			this.uploadNextChunk();
		} else {
			this.getOffset();
		}
	},


	prepareChunks: function () {
		if (this.frObj.opts.chunkSize > 0) {
			var chunkCount = Math.max(Math.ceil((this.file.size - this.offset) / this.frObj.opts.chunkSize),1);
		} else {
			var chunkCount = 1;
		}
		for (var offset = 0; offset < chunkCount; offset++) {
			this.chunks.push(new FileRunChunk(this.frObj, this, offset));
		}
	},

	/**
	 * Free-up memory used by the uploadingChunk
	 * @function
	 */
	removeUploadingChunk: function () {
		var chunkCount = this.chunks.length;
		for (var i = 0; i < chunkCount; i++) {
			if (this.chunks[i] == this.uploadingChunk) {
				this.uploadingChunk = null;
				this.chunks[i] = null;
				return true;
			}
		}
		return false;
	},

	/**
	 * Get current upload progress status
	 * @function
	 * @returns {number} from 0 to 1
	 */
	measureProgress: function () {
		if (this.error) {
			this.progress = 0;
		} else {
			if (this.complete) {
				this.progress = 1;
			} else {
				if (this.size == 0 && this.completedBytes == 0) {
					this.progress = 1;
				} else {
					this.progress = this.completedBytes/this.size;
				}
			}
		}
	},

	/**
	 * Returns remaining time to finish upload file in seconds. Accuracy is based on average speed.
	 * If speed is zero, time remaining will be equal to positive infinity `Number.POSITIVE_INFINITY`
	 * @function
	 * @returns {number}
	 */
	timeRemaining: function () {
		if (this.paused || this.error || this.complete) {
			return 0;
		}
		var delta = this.size - this.completedBytes;
		if (delta && !this.averageSpeed) {
			return Number.POSITIVE_INFINITY;
		}
		if (!delta && !this.averageSpeed) {
			return 0;
		}
		return Math.floor(delta / this.averageSpeed);
	}
};