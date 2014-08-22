//require('v8-profiler');
var agent = require('webkit-devtools-agent');
agent.start();

var MC = require('../../lib/lib').MongoConnection;
var MQ = require('../../lib/lib').MongoMQ;

var options = {host: 'localhost', databaseName: 'tests', queueCollection: 'capped_collection', autoStart: true};

var mq = module.exports = new MQ(options);

var recordNumber = 0;
var emitRecord = function(){
  console.log('emitting '+recordNumber);
  mq.emit('greet', recordNumber, function(err, data){
    console.log('Response:');
    console.log(' err>', err);
    console.log(' dat>', data);
    emitRecord();
  });
  recordNumber++;
};

mq.ready(function(){
  console.log('ready');
});

var putRecord = function(){
  setTimeout(function(){
    emitRecord();
    putRecord();
  }, 100);
};

(function(){
  var logger = new MC(options);
  logger.open(function(err, mc){
    if(err){
      console.log('ERROR: ', err);
    }else{
      mc.collection('log', function(err, loggingCollection){
        loggingCollection.remove({},  function(){
          if(!options.autoStart){
            /*
            mq.start(function(err){
              putRecord();
            });
            */
          }
        });
      });
    }
  });
})();

emitRecord();
