var readline = require('readline');
var MongoMQ = require('../../lib/MongoMQ').MongoMQ;
var emitter = new MongoMQ();

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var helloHandler = function(err, data, next){
  console.log(err||data); // display any errors or the message
  next(); // make sure we reset the listener
  emitter.stop(); // stop the queue listener completely and exit the application
};

emitter.start(function(){
  rl.question("What is your name? ", function(answer) { // prompt the user for their name
    emitter.emit('hello', {name: answer}, helloHandler); // send a message to the hello listener
    rl.close(); // close the readline instance
  });
});