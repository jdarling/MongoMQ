var fs = require('fs');
var util = require('util');
var Options = require('./options');

var defaults = {
  autoInit: true
};

var Logger = module.exports = function(options, callInit){
  var self = this;
  options = Options.ensure(options||{}, defaults);
  if(options.autoInit){
    self.init(options);
  }
};

Logger.prototype.debug = function(message, object){
  this.logItem('debug', message, object);
};
Logger.prototype.debug.description = 'Writes a debug message to the log.';

Logger.prototype.log = function(message, object){
  this.logItem('log', message, object);
};
Logger.prototype.log.description = 'Writes a log message to the log.';

Logger.prototype.error = function(message, object){
  this.logItem('ERROR', message, object);
};
Logger.prototype.error.description = 'Writes a error message to the log.';

Logger.prototype.init = function(options){
  var self = this;
  options=options||{};
  self.fileStream = options.toFile!==false?fs.createWriteStream(fs.existsSync(process.argv[1])?process.argv[1]+'.log':'log.txt')||false:false;
  self.toScreen = !!options.toScreen;
  self.log('started', process);
  self.divider();
};
Logger.prototype.init.description = 'Initializes the logging object, this is the other routine to replace if you want to write your own logger.';

Logger.prototype.logItem = function(level, message, object){
  this.write((level||'').toLowerCase()==='error', level+':', message+(object?'\r\n'+util.inspect(object, false, null, false, false):''));
};
Logger.prototype.logItem.description = 'Writes a specific type of message to the log.';

Logger.prototype.write = function(force){
  var self = this;
  var startAt = 1, args = Array.prototype.slice.apply(arguments), i, l = args.length, msg = '';
  if(typeof(force)!=='boolean'){
    startAt--;
    force = false;
  }
  for(i=startAt; i<l; i++){
    if(typeof(args[i])!=='string'){
      msg += util.inspect(args[i], false, null, false, false);
    }else{
      msg += args[i];
    }
    msg+='\t';
  }
  if(force){
    console.log(msg);
  }
  if(self.fileStream){
    self.fileStream.write((new Date())+'\r\n'+msg+'\r\n');
  }
  if((!force)&&(self.toScreen)){
    console.log(msg);
  }
};
Logger.prototype.write.description = 'Performs the actual write, if your going to derrive from Logger this is the routine to replace.';

Logger.prototype.divider = function(){
  var self = this;
  if(self.toFile){
    self.toFile.write((new Array(40).join('-='))+'\r\n');
  }
};
Logger.prototype.divider.description = 'Writes a divider to the log.';
