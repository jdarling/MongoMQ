var MongoMQ = require('../lib/MongoMQ').MongoMQ;
var repl = require('repl');

var l = process.argv.length, tmp, names, reCmdLineStrip=/^(\-|\\|\/)*/i, opts = {};
for(var i = 2; i < l; i++){
  tmp = process.argv[i].replace(reCmdLineStrip, '').split('=');
  name = tmp.shift();
  if(tmp.length>0) val = tmp.join('=');
  else val = true;
  tmp = opts;
  names = name.split('.');
  while(names.length>1){
    name = names.shift();
    tmp = tmp[name]=tmp[name]||{};
  }
  tmp[names.shift()]=val;
}

var queue = new MongoMQ(opts);

var r = repl.start({
      prompt: "MongoMQ>"
    });

r.on('exit', function(){
  queue.stop(); // force a close
});

var funcName, value, funcs = [];
for(funcName in queue){
  value = queue[funcName];
  if(typeof(value)=='function'){
    funcs.push(funcName);
    r.context[funcName] = (function(f){
      return function(){
        f.apply(queue, arguments);
      };
    })(value);
  }
}

r.context.logAny = function(){
  queue.onAny(function(err, data, next){
    console.log(err, data);
    next();
  });
};

r.context.help = function(){
  msg = 'Built in test methods:\r\n'+
      '  help() - shows this message\r\n'+
      '  logAny() - logs any message to the console\r\n'+
      '  listeners() - Alias of the queue.listeners property surfaced as a method\r\n';
  var l = funcs.length;
  for(var i = 0; i<l; i++){
    msg += '  '+funcs[i]+'() - Alias of the queue.'+funcs[i]+' method\r\n';
  }
  msg += '\r\nInstance Data\r\n'+
      '  queue - the global MongoMQ instance\r\n'
      ;
  console.log(msg);
  return '';
};

r.context.listeners = function(){
  return queue.listeners;
};

r.context.queue = queue;
