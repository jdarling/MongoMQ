Webserver Example
=================

The webserver example was built using [WebMatrix 2.0](http://www.microsoft.com/web/webmatrix/) and is an example of a complete useable sample of how an application stack could be developed with MongoMQ.  The idea is to have a webserver where the processing can take place anywhere else on the network or any place where the MongoDB is available.  At the same time it could be ran in a load balanced solution where multiple copies of the stack are balanced and still share work.  It uses MongoDB as the data store since it must already be available to use MongoMQ.

The code used for the webserver demo was modified from [Steven Sandersons video tutorials](https://github.com/SteveSanderson/nodejs-webmatrix-video-tutorials) actual videos are [here](http://blog.stevensanderson.com/2012/07/09/node-js-development-with-webmatrix-2-and-express/)

Installation
============

Make sure you run npm install in the webserver root folder to install the dependencies required to run Steven's code.

In a command window run the examples/webserver/services/dao.js file:
  node dao

You can open the application stack in WebMatrix and run it, or you can simply run:
  node server
  
Then point your browser at http://localhost:3000/ and use Invitify (alpha)

Modifications
=============

This section explains the modifications to the origional code to make it work.

  1) Updated the package.json file, seems newer versions of express or something breaks the origional code, so locked it to specific versions.
  2) Updated api/db.js and api/server.js to call out to the MongoMQ service bus instead of the stub service
  3) Updated api/server.js to support callbacks instead of return statements from methods