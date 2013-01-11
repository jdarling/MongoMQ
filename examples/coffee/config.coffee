exports.db =
  	host: 	'localhost'
  	name: 	'tests'

exports.db.url = "mongodb://#{exports.db.host}/#{exports.db.name}"