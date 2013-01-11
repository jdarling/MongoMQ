config  = require './config'
MongoMQ = (require '../../lib/lib').MongoMQ

queue = new MongoMQ
	autoStart: 	true
	host:		config.db.host
	collectionName:	'capped_collection'
	database:	config.db.name

#queue.start()

exports.queue = queue