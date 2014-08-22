var spawn = require('child_process').spawn;

var _children = [];

var Children = function(){
};

Children.prototype.startChild = function(fileName){
  var args = Array.prototype.slice.call(arguments);
  var child = spawn('node', args);
  child.processFile = fileName;
  child.arguments = args;
  child.on('exit', (function(aChild){
    return function(code, signal){
      var idx = _children.indexOf(aChild);
      if(idx>-1&&_children[idx]) console.log(('Child ('+_children[idx].processFile+') '+aChild.pid+' is dying!').yellow);
      else console.log(('Child ('+aChild.pid+') is dying!').yellow);
      if(idx>-1){
        _children.splice(idx, 1);
        console.log('Child killed successfully!'.green);
      }
    };
  })(child));
  child.on('uncaughtException', (function(aChild){
    return function(err){
      console.error('EXCEPTION: ', err);
    };
  })(child));
  child.stdout.on('data', (function(aChild){
    return function(data){
      console.log(data.toString());
    };
  })(child));
  child.stderr.on('data', (function(aChild){
    return function(data){
      console.error('ERROR: ', data.toString());
    };
  })(child));
  _children.push(child);
  return child;
};

Children.prototype.children = function(){
  return _children;
};

module.exports = new Children();
