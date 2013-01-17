var MongoMQ = require('../lib/MongoMQ');
var repl = require('repl');

var l = process.argv.length, tmp, names, reCmdLineStrip=/^(\-|\\|\/)*/i, opts = {autoStart: false},
  alias = {
    db: 'databaseName',
    collection: 'queueCollection',
    queue: 'queueCollection'
  };
for(var i = 2; i < l; i++){
  tmp = process.argv[i].replace(reCmdLineStrip, '').split('=');
  name = tmp.shift();
  if(tmp.length>0) val = tmp.join('=');
  else val = true;
  tmp = opts;
  names = name.split('.');
  while(names.length>1){
    name = names.shift();
    name = alias[name]||name;
    tmp = tmp[name]=tmp[name]||{};
  }
  name = names.shift();
  name = alias[name]||name;
  tmp[name]=val;
}

var queue = new MongoMQ(opts);

queue.ready(function(){
  console.log('Connected');
});

queue.stopped(function(){
  console.log('Disconnected');
});

queue.error(function(err){
  console.log(err);
});

var r = repl.start({
      prompt: "MongoMQ>"
    });

r.on('exit', function(){
  queue.stop(); // force a close
});

var funcName, value, funcs = [], ftmp;
for(funcName in queue){
  value = queue[funcName];
  if(typeof(value)=='function'){
    ftmp = r.context[funcName]||(function(f){
        return function(){
          f.apply(queue, arguments);
        };
      })(value);
    funcs.push({name: funcName, description: value.description, f: ftmp, a: value});
    if(!r.context[funcName]){
      r.context[funcName] = ftmp;
    }
  }
}

r.context.connect = function(connectionString, databaseName, collectionName){
  queue.close(function(){
    queue.options.connectionString = connectionString||queue.options.connectionString;
    queue.options.databaseName = databaseName||queue.options.databaseName;
    queue.options.queueCollection = collectionName||queue.options.queueCollection;
    queue.start(function(err){
      if(err){
        console.log(err);
      }
    });
  });
};
r.context.connect.description = 'Connect to a specific MongoMQ instance to work with';

r.context.status = function(callback){
  callback = callback || function(err, results, info){
    results = results || [];
    var i, l=results.length;
    console.log('\r\n-=[Queue Status]=-');
    for(i=0; i<l; i++){
      console.log('Event: '+results[i]._id, 'Depth: '+results[i].value);
    }
  };
  queue.status(callback);
};

r.context.help = function(methodName){
  var msg = false;
  function getParamNames(func) {
    var funStr = func.toString();
    return funStr.slice(funStr.indexOf('(')+1, funStr.indexOf(')')).match(/([^\s,]+)/g);
  }
  var describe = function(i, prefix){
    prefix = prefix||'';
    var result = prefix+funcs[i].name+'('+getParamNames(queue[funcs[i].name])+') - Alias of the queue.'+funcs[i].name+' method\r\n';
    if(funcs[i].description){
      result += prefix+'  -> '+funcs[i].description+'\r\n';
    }
    return result;
  };
  if(methodName){
    var i = false, l = funcs.length, index = false;
    for(i = 0; (i<l)&&(!index); i++){
      if((funcs[i].name===methodName)||(funcs[i].f===methodName)||(funcs[i].a===methodName)){
        index=i;
      }
    }
    if(index){
      msg = describe(index);
    }
  }
  if(!msg){
    msg = 'Built in test methods:\r\n'+
        '  help() - shows this message\r\n'+
        '  connect(connectionString, databaseName, collectionName) - Connect to a specific MongoMQ instance to work with\r\n';
    var i, l = funcs.length;
    for(i = 0; i<l; i++){
      msg += describe(i, '  ');
    }
    msg += '\r\nInstance Data\r\n'+
        '  queue - the global MongoMQ instance\r\n'
        ;
  }
  console.log(msg);
  return '';
};

r.context.queue = queue;
