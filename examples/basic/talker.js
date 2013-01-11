var MC = require('../../lib/lib').MongoConnection;
var MQ = require('../../lib/lib').MongoMQ;

var options = {databaseName: 'tests', queueCollection: 'capped_collection', autoStart: false};
//var options = {servers: ['ndcsrvcdep601', 'ndcsrvcdep602'], databaseName: 'tests', queueCollection: 'capped_collection', autoStart: false};

var mq = module.exports = new MQ(options);

var recordNumber = 0;
var putRecord = function(){
  console.log('Emitting: '+recordNumber);
  mq.emit('test', recordNumber);
  recordNumber++;
  setTimeout(putRecord, 5);
};

(function(){
  var logger = new MC(options);
  logger.open(function(err, mc){
    if(err){
      console.log('ERROR: ', err);
    }else{
      mc.collection('log', function(err, loggingCollection){
        loggingCollection.remove({},  function(){
          mq.start(function(err){
            putRecord();
          });
        });
      });
    }
  });
})();
