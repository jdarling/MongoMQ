var express = require('express'),
    app = module.exports = express.createServer(),
    ejsMiddleware = require('ejs-middleware'),
    db = require('./db.js'),
    invitation = require('./models/invitation.js'),
    vote = require('./models/vote.js');

app.use(express.bodyParser());

app.get('/invitations/:id', function(req, res) {
    db.load(req.params.id, function(err, result){
      result ? res.send(result)
             : res.send(404);
    });
    /*
    var result = db.load(req.params.id);
    result ? res.send(result)
           : res.send(404);
    */
});

app.post('/invitations', function(req, res) {
    var newInvitation = new invitation(req.body);
    db.save(newInvitation, function(err, record){
      res.header('Location', 'http://' + req.headers.host + app.set('basepath') + req.url + '/' + record.id)
      res.send({ id: record.id }, 201);
    });
});

app.post('/invitations/:id/votes', function(req, res) {
    //var invitation = db.load(req.params.id);
    db.load(req.params.id, function(err, invitation){
      if (invitation) {
          invitation.votes.push(new vote(req.body));
          db.save(invitation, function(err, record){
            app.emit('invitationUpdate', record);
            res.send(200);
          });
      } else {
          res.send(404);
      }
    });
});

// ----
// Add test data for demo
/*
db.save(new invitation(
    { title: 'Stockholm Node.js user group dinner - June 2012', choices: [{ displayText: 'Tue 12th' }, { displayText: 'Wed 13th' }, { displayText: 'Thu 14th' }, { displayText: 'Fri 15th' }] }, 
    'test' // ID
));
*/