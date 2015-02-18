  /**
   * @param [opts]
   * @param {number} [opts.chunkSize]
   * @param {bool} [opts.singleFile]
   * @param {string} [opts.fileParameterName]
   * @param {number} [opts.progressCallbacksInterval]
   * @param {number} [opts.speedSmoothingFactor]
   * @param {Object|Function} [opts.query]
   * @param {Object} [opts.headers]
   * @param {bool} [opts.withCredentials]
   * @param {string} [opts.method]
   * @param {string} [opts.target]
   * @param {number} [opts.maxChunkRetries]
   * @param {number} [opts.resumeLargerThan]
   * @param {number} [opts.chunkRetryInterval]
   * @param {Array.<number>} [opts.permanentErrors]
   * @param {Function} [opts.generateUniqueIdentifier]
   * @param {Function} [opts.validateGetOffsetResponse] - mandatory, sets the offset
   * @param {Object} [opts.validateGetOffsetResponseScope] - optional, scope for the above function
   * @param {Function} [opts.validateChunkResponse] - mandatory, validates
   * @param {Object} [opts.validateChunkResponseScope] - optional, scope for the above function
   * @constructor
   * todo: error reporting when the source of an uploading file is no longer available on client's computer
   */
  function FileRun(opts) {

    /**
     * List of FileRunFile objects
     * @type {Array.<FileRunFile>}
     */
    this.files = [];


	  /**
	   * Original queue state
	   * @type {boolean}
	   */
	 this.paused = false;

	 this.averageSpeed = 0;

	  /**
	   * Indicated the total number of successfully uploaded files
	   * @type {integer}
	   */
	 this.completedFiles = 0;

	  /**
	   * Indicated the total number of active uploads
	   * @type {integer}
	   */
	 this.uploadingFiles = 0;

	  /**
	   * Indicated the total size of the queue
	   * @type {integer}
	   */
	  this.size = 0;

	  /**
	   * Indicated the amount of successfully uploaded data
	   * @type {integer}
	   */
	  this.completedBytes = 0;

    /**
     * Default options for FileRun.js
     * @type {Object}
     */
    this.defaults = {
      chunkSize: false,
      singleFile: false,
      fileParameterName: 'file',
      progressCallbacksInterval: 100,
      speedSmoothingFactor: 0.1,
      query: {},
      headers: {},
      withCredentials: false,
      target: '/',
      generateUniqueIdentifier: null,
      maxChunkRetries: 3,
	  resumeLargerThan: 10485760,
      chunkRetryInterval: null,
	  maxSimultaneous: 1
    };


    /**
     * Current options
     * @type {Object}
     */
    this.opts = {};

    /**
     * List of events:
     *  key stands for event name
     *  value array list of callbacks
     * @type {}
     */
    this.events = {};

    var $ = this;

    /**
     * On drop event
     * @function
     * @param {MouseEvent} event
     */
    this.onDrop = function (event) {
      event.stopPropagation();
      event.preventDefault();
      var dataTransfer = event.dataTransfer;
      if (dataTransfer.items && dataTransfer.items[0] &&
        dataTransfer.items[0].webkitGetAsEntry) {
        $.webkitReadDataTransfer(event);
      } else {
        $.addFiles(dataTransfer.files, event);
      }
    };

    /**
     * Current options
     * @type {Object}
     */
    this.opts = this.extend({}, this.defaults, opts || {});
  }

  FileRun.prototype = {
    /**
     * Set a callback for an event, possible events:
     * fileSuccess(file), fileProgress(file), fileAdded(file, event),
     * fileRetry(file), fileError(file, message), complete(),
     * progress(), error(message, file), pause()
     * @function
     * @param {string} event
     * @param {Function} callback
     */
    on: function (event, callback) {
      event = event.toLowerCase();
      if (!this.events.hasOwnProperty(event)) {
        this.events[event] = [];
      }
      this.events[event].push(callback);
    },

    /**
     * Remove event callback
     * @function
     * @param {string} [event] removes all events if not specified
     * @param {Function} [fn] removes all callbacks of event if not specified
     */
    off: function (event, fn) {
      if (event !== undefined) {
        event = event.toLowerCase();
        if (fn !== undefined) {
          if (this.events.hasOwnProperty(event)) {
            arrayRemove(this.events[event], fn);
          }
        } else {
          delete this.events[event];
        }
      } else {
        this.events = {};
      }
    },

    /**
     * Fire an event
     * @function
     * @param {string} event event name
     * @param {...} args arguments of a callback
     * @return {bool} value is false if at least one of the event handlers which handled this event
     * returned false. Otherwise it returns true.
     */
    fire: function (event, args) {
      // `arguments` is an object, not array, in FF, so:
      args = Array.prototype.slice.call(arguments);
      event = event.toLowerCase();
      var preventDefault = false;
      if (this.events.hasOwnProperty(event)) {
        this.each(this.events[event], function (callback) {
          preventDefault = callback.apply(this, args.slice(1)) === false || preventDefault;
        });
      }
      if (event != 'catchall') {
        args.unshift('catchAll');
        preventDefault = this.fire.apply(this, args) === false || preventDefault;
      }
      return !preventDefault;
    },

    /**
     * Read webkit dataTransfer object
     * @param event
     */
    webkitReadDataTransfer: function (event) {
      var $ = this;
      var queue = event.dataTransfer.items.length;
      var files = [];
      this.each(event.dataTransfer.items, function (item) {
        var entry = item.webkitGetAsEntry();
        if (!entry) {
          decrement();
          return ;
        }
        if (entry.isFile) {
          // due to a bug in Chrome's File System API impl - #149735
          fileReadSuccess(item.getAsFile(), entry.fullPath);
        } else {
          entry.createReader().readEntries(readSuccess, readError);
        }
      });
      function readSuccess(entries) {
        queue += entries.length;
        $.each(entries, function(entry) {
          if (entry.isFile) {
            var fullPath = entry.fullPath;
            entry.file(function (file) {
              fileReadSuccess(file, fullPath);
            }, readError);
          } else if (entry.isDirectory) {
            entry.createReader().readEntries(readSuccess, readError);
          }
        });
        decrement();
      }
      function fileReadSuccess(file, fullPath) {
        file.relativePath = fullPath;
        files.push(file);
        decrement();
      }
      function readError(fileError) {
        throw fileError;
      }
      function decrement() {
        if (--queue == 0) {
          $.addFiles(files, event);
        }
      }
    },

    /**
     * Generate unique identifier for a file
     * @function
     * @param {FileRunFile} file
     * @returns {string}
     */
    generateUniqueIdentifier: function (file) {
      var custom = this.opts.generateUniqueIdentifier;
      if (typeof custom === 'function') {
        return custom(file);
      }
      // Some confusion in different versions of Firefox
      var relativePath = file.relativePath || file.webkitRelativePath || file.fileName || file.name;
      return file.size + '-' + relativePath.replace(/[^0-9a-zA-Z_-]/img, '');
    },



    browseFiles: function (isDirectory, singleFile) {
	    FileRunUtils.browseFiles({
		    entireFolder: isDirectory,
		    singleFile: singleFile,
		    onSelect: function(files, e) {
			    if (files.length > 0) {
				    this.addFiles(files, e);
			    }
		    }, scope: this
	    });
    },


    /**
     * Start processing the queue
     * @function
     */
    start: function () {
		// Kick off the queue
	    this.paused = false;
		this.uploadNextFile();
	    this.fire('uploadStart');
    },

  /**
   * Upload next file in the queue
   * @function
   */
	uploadNextFile: function () {
		if (this.paused) {return false;}
		var queuePausedFiles = 0;
		var uploadingFiles = 0;
		var nothingToDo = true;
		this.each(this.files, function (file) {
			if (!file.complete) {
				if (file.queuePaused) {
					queuePausedFiles++;
				} else {
					if (!file.uploading) {
						if (this.uploadingFiles < this.opts.maxSimultaneous) {
							nothingToDo = false;
							file.start();
						} else {
							return false;
						}
					} else {
						uploadingFiles++;
					}
				}
			}
		}, this);
		if (nothingToDo && !queuePausedFiles && !uploadingFiles) {
		  this.fire('complete');
		}
	},

    /**
     * Pause queue including the currently uploading file
     * @function
     */
    pause: function () {
		this.paused = true;
		this.each(this.files, function (file) {
			if (!file.queuePaused && !file.paused && !file.complete) {
				file.pause();
			}
		});
	    this.uploadingFiles = 0;//this should not be necessary, the number of currently uploading files doesn't get updated properly when there is an error with one of the files
    },

    /**
     * Cancel upload of all FileRunFile objects and remove them from the list.
     * @function
     */
    removeAll: function () {
      for (var i = this.files.length - 1; i >= 0; i--) {
	      this.removeFile(this.files[i]);
      }
	  this.averageSpeed = 0;
	  this.uploadingFiles = 0;
    },

    /**
     * Returns a number between 0 and 1 indicating the current upload progress
     * of all files.
     * @function
     * @returns {number}
     */
    getProgress: function () {
	    if (this.size == 0 && this.completedBytes == 0) {return 1;}
	    return this.completedBytes/this.size;
    },

	onFileSuccess: function(file, serverReply) {
		this.uploadingFiles--;
		this.completedFiles++;
		this.fire('progress', this);
		this.fire('fileSuccess', file, serverReply);
		this.uploadNextFile();
	},

	onFileError: function(file, serverReply) {
		this.uploadingFiles--;
		this.fire('fileError', file, serverReply);
		this.fire('error', serverReply, file);
	},

	onFilePause: function(file, pauseInTheQueue, fileWasUploading) {
		if (fileWasUploading) {
			this.uploadingFiles--;
		}
		if (pauseInTheQueue) {
			this.uploadNextFile();
		}
		this.fire('fileProgress', file);
	},

	onFileStart: function() {
		this.uploadingFiles++;
	},

    /**
     * Add a HTML5 File object to the list of files.
     * @function
     * @param {File} file
     * @param {Event} [event] event is optional
     */
    addFile: function (file, event) {
      this.addFiles([file], event);
    },

    /**
     * Add a HTML5 File object to the list of files.
     * @function
     * @param {FileList|Array} fileList
     * @param {Event} [event] event is optional
     */
    addFiles: function (fileList, event) {
      this.each(fileList, function (file) {
		if (this.opts.singleFile && this.files.length > 0) {
			return false;
		}
	    // Directories have size `0` and name `.`
        if (!(file.size % 4096 === 0 && (file.name === '.' || file.fileName === '.')) &&
          !this.getFromUniqueIdentifier(this.generateUniqueIdentifier(file))) {
          var f = new FileRunFile(this, file);
          if (this.fire('fileAdded', f, event)) {
	          this.files.push(f);
	          this.size += f.size;
          }
        }
      }, this);
      this.fire('filesSubmitted', this.files, event);
	  if (this.opts.startOnSubmit) {
	   this.start();
	  }
    },


    /**
     * Cancel upload of a specific FileRunFile object from the list.
     * @function
     * @param {FileRunFile} file
     */
    removeFile: function (file) {
	   var removedUploading = false;
      for (var i = this.files.length - 1; i >= 0; i--) {
        if (this.files[i] === file) {
	      this.size -= file.size;
	      if (file.uploading) {
		      if (file.uploadingChunk) {
			      file.uploadingChunk.abort();
		      }
		      removedUploading = true;
		      this.uploadingFiles--;
	      }
	      if (file.complete) {
		      this.completedFiles--;
	      }
	        this.completedBytes -= file.completedBytes;
	        file = null;
          this.files.splice(i, 1);
        }
      }
	    if (removedUploading) {
	        this.uploadNextFile();
	    }
	    return true;
    },

    /**
     * Look up a FileRunFile object by its unique identifier.
     * @function
     * @param {string} uniqueIdentifier
     * @returns {boolean|FileRunFile} false if file was not found
     */
    getFromUniqueIdentifier: function (uniqueIdentifier) {
      var ret = false;
      this.each(this.files, function (file) {
        if (file.uniqueIdentifier === uniqueIdentifier) {
          ret = file;
        }
      });
      return ret;
    },

    /**
     * Returns remaining time to upload all files in seconds. Accuracy is based on average speed.
     * If speed is zero, time remaining will be equal to positive infinity `Number.POSITIVE_INFINITY`
     * @function
     * @returns {number}
     */
    timeRemaining: function () {
      var sizeDelta = this.size - this.completedBytes;
      if (sizeDelta && !this.averageSpeed) {
        return Number.POSITIVE_INFINITY;
      }
      if (!sizeDelta && !this.averageSpeed) {return 0;}
      return Math.floor(sizeDelta / this.averageSpeed);
    },

	  /**
	   * Remove value from array
	   * @param array
	   * @param value
	   */
	  arrayRemove: function (array, value) {
		var index = array.indexOf(value);
		if (index > -1) {
			array.splice(index, 1);
		}
	  },

	/**
	 * Extends the destination object `dst` by copying all of the properties from
	 * the `src` object(s) to `dst`. You can specify multiple `src` objects.
	 * @function
	 * @param {Object} dst Destination object.
	 * @param {...Object} src Source object(s).
	 * @returns {Object} Reference to `dst`.
	 */
	extend: function(dst, src) {
		this.each(arguments, function(obj) {
			if (obj !== dst) {
				this.each(obj, function(value, key){
					dst[key] = value;
				});
			}
		}, this);
		return dst;
	},

	/**
	 * Iterate each element of an object
	 * @function
	 * @param {Array|Object} obj object or an array to iterate
	 * @param {Function} callback first argument is a value and second is a key.
	 * @param {Object=} context Object to become context (`this`) for the iterator function.
	 */
	each: function(obj, callback, context) {
		if (!obj) {return ;}
		if (typeof(obj.length) !== 'undefined') {
			for (var key = 0; key < obj.length; key++) {
				if (callback.call(context, obj[key], key) === false) {
					return ;
				}
			}
		} else {
			for (var key in obj) {
				if (obj.hasOwnProperty(key) && callback.call(context, obj[key], key) === false) {
					return ;
				}
			}
		}
	}
 };

var FileRunUtils = {
	browserSupport: {
		files: (
			typeof window.File !== 'undefined' &&
			typeof Blob !== 'undefined' &&
			typeof window.FileList !== 'undefined' &&
			// slicing files support
			(!!Blob.prototype.slice || !!Blob.prototype.webkitSlice || !!Blob.prototype.mozSlice || false)
		),
		folders: /WebKit/.test(window.navigator.userAgent)
	},
	attachDrop: function (opts) {
		if (!this.browserSupport.files) {return false;}
		opts.domNode.addEventListener('dragenter', function(e){
			e.stopPropagation();
			e.preventDefault();
			if (opts.onDragEnter) {opts.onDragEnter.call(opts.scope, e);}
		}, false);

		opts.domNode.addEventListener('dragover', function(e){
			e.dataTransfer.dropEffect = 'copy';
			e.stopPropagation();
			e.preventDefault();
			if (opts.onDragOver) {opts.onDragOver.call(opts.scope, e);}
			return false;
		}, false);

		opts.domNode.addEventListener('dragleave', function(e){
			e.stopPropagation();
			e.preventDefault();
			if (opts.onDragLeave) {opts.onDragLeave.call(opts.scope, e);}
		}, false);

		opts.domNode.addEventListener('drop', function(e) {
			e.stopPropagation();
			e.preventDefault();
			opts.onDrop.call(opts.scope, e)
		}, false);
	},
	browseFiles: function (opts) {
		var input = document.createElement('input');
		input.setAttribute('type', 'file');
		if (!opts.singleFile) {
			input.setAttribute('multiple', 'multiple');
			if (opts.entireFolder) {
				input.setAttribute('webkitdirectory', 'webkitdirectory');
			}
		}
		input.style.display = 'none';
		input.addEventListener('change', function (e) {
			opts.onSelect.call(opts.scope, e.target.files, e);
			document.body.removeChild(this);
		}, false);
		document.body.appendChild(input);
		input.click();
	}
}