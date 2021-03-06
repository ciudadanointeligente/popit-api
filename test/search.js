"use strict";

var assert = require('assert');
var mongoose = require('mongoose');
var defaults = require('./defaults');
var fixture = require('./fixture');
var elasticsearch = require('../src/mongoose/elasticsearch').client;
var dropElasticsearchIndex = require('./util').dropElasticsearchIndex;
require('../src/models');

describe("Search", function() {
  this.timeout(5000);
  var Person;

  before(function() {
    mongoose.connect('mongodb://localhost/' + defaults.databaseName);
    Person = mongoose.model('Person');
  });

  before(function(done) {
    dropElasticsearchIndex(Person.indexName())(done);
  });

  beforeEach(fixture.clearDatabase);

  after(function(done) {
    mongoose.connection.close(done);
  });

  it("indexes documents after saving", function(done) {
    var person = new Person();
    person._id = person.id = "jsmith";
    person.name = "John Smith";
    person.save(function(err) {
      if (err) {
        return done(err);
      }
      person.on('es-indexed', onIndexed);
    });

    function onIndexed() {
      elasticsearch.get({
        index: Person.indexName(),
        type: Person.typeName(),
        id: person.id
      }, function(err, result) {
        if (err) {
          return done(err);
        }
        assert.equal("John Smith", result._source.name);
        done();
      });
    }
  });

  it("removes documents after deleting", function(done) {
    var person = new Person();
    person._id = person.id = "jsmith";
    person.name = "John Smith";
    person.save(function(err) {
      if (err) {
        return done(err);
      }
      person.on('es-indexed', onIndexed);
    });

    function onIndexed() {
      person.remove(function(err) {
        if (err) {
          return done(err);
        }
        person.on('es-removed', onRemoved);
      });
    }

    function onRemoved() {
      elasticsearch.get({
        index: Person.indexName(),
        type: Person.typeName(),
        id: person.id
      }, function(err, result) {
        assert(err);
        assert(!result.exists);
        done();
      });
    }
  });

});
