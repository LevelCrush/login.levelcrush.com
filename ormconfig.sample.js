module.exports = {

  "type": "mysql",
  "host": "localhost",
  "port": 3306,
  "username": "root",
  "password": "",
  "database": "levelcrush",
  "synchronize": false,
  "logging": false,
  "entities": [
    __dirname + "/orm/entity/**/*.{js,ts}"
  ],
  "migrations": [
    __dirname + "/orm/migration/**/*.{js,ts}"
  ],
  "subscribers": [
    __dirname + "/orm/subscriber/**/*.{js,ts}"
  ],
  "cli": {
    "entitiesDir": __dirname + "/orm/entity",
    "migrationsDir": __dirname + "/orm/migration",
    "subscribersDir": __dirname + "/orm/subscriber"
  }
}