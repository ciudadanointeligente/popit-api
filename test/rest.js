"use strict";

var supertest     = require("supertest"),
    async         = require('async'),
    assert        = require('assert'),
    fixture       = require("./fixture"),
    defaults      = require("./defaults"),
    packageJSON   = require("../package"),
    serverApp     = require("../test-server-app"),
    person        = require('./util').person,
    mongoose      = require('mongoose'),
    dropElasticsearchIndex = require('./util').dropElasticsearchIndex,
    refreshElasticsearchIndex = require('./util').refreshElasticsearchIndex,
    apiApp = require('..');

require('../src/models');

var request = supertest(serverApp);

describe("REST", function () {

  beforeEach(fixture.clearDatabase);

  before(function() {
    mongoose.connect('mongodb://localhost/' + defaults.databaseName);
  });

  after(function(done) {
    mongoose.connection.close(done);
  });

  describe("malformed requests", function () {
    describe("Content-Type of 'json' but no body", function () {
      it("should not 400", function (done) {
        request
          .del("/api/persons/123")
          .type('json') // to force the application/json content type header
          .send("")     // don't send anything
          .expect(204)
          .end(done);
      });
    });
  });

  describe("/api ", function () {
    it("should 200 with API info", function (done) {
      request
        .get("/api")
        .expect(200)
        .expect({
          info: {
            databaseName: defaults.databaseName,
            version:      packageJSON.version,
          },
        })
        .end(done);
      
    });
  });

  describe("/api/collectionName", function () {

    describe("GET", function () {

      it("should return empty list", function (done) {
        async.each( [ 'persons', 'memberships', 'organizations', 'posts' ], function(type, callback) {
            request
              .get("/api/" + type)
              .expect(200)
              .end(function(err, res) {
                assert.ifError(err);
                assert.equal(res.body.result.length, 0);
                callback();
              });
          }, done);
      });

      describe("should return created", function () {
        beforeEach(fixture.loadFixtures);

        it('persons', function(done) {
          request
            .get("/api/persons")
            .expect(200)
            .end(function(err, res) {
              if (err) {
                return done(err);
              }
              assert.equal('fred-bloggs', res.body.result[0].id);
              assert.equal('Fred Bloggs', res.body.result[0].name);
              assert.equal('joe-bloggs', res.body.result[1].id);
              assert.equal('Joe Bloggs', res.body.result[1].name);
              done();
            });
        });

        it('organizations', function(done) {
          request
            .get("/api/organizations")
            .expect(200)
            .end(function(err, res) {
              if (err) {
                return done(err);
              }
              assert.equal('parliament', res.body.result[0].id);
              assert.equal('Houses of Parliament', res.body.result[0].name);
              assert.equal('commons', res.body.result[1].id);
              assert.equal('House of Commons', res.body.result[1].name);
              done();
            });
        });

        it('memberships', function(done) {
          request
            .get("/api/memberships")
            .expect(200)
            .expect({
              total: 2,
              page: 1,
              per_page: 30,
              has_more: false,
              result: [
                { id: 'oldMP', post_id: 'avalon', organization_id: 'commons', role: 'Member of Parliament',
                  person_id: 'fred-bloggs', start_date: '2000', end_date: '2004', links: [], contact_details: [] },
                { id: 'backAsMP', post_id: 'avalon', organization_id: 'commons', role: 'Member of Parliament',
                    person_id: 'fred-bloggs', start_date: '2011', links: [], contact_details: [] },
              ],
            })
            .end(done);
        });

        it('posts', function(done) {
          request
            .get("/api/posts")
            .expect(200)
            .end(function(err, res) {
              if (err) {
                return done(err);
              }

              assert.equal(2, res.body.result.length);
              assert.equal(2, res.body.result[1].memberships.length);

              done();
            });
        });
      });

    });

    describe("POST", function () {

      it("should create entry and return Location when valid", function (done) {
        async.waterfall([
          function(callback){
            request
              .post("/api/persons")
              .send({ name: "Joe Bloggs" })
              .expect(200)
              .end(function (err, res) {
                assert(res.body.result.id);
                assert(res.body.result.name);
                callback(err, res.body.result.id);
              });
          },
          function(id, callback){
            request
              .get("/api/persons/" + id)
              .expect(200)
              .end(function (err, res) {
                assert(res.body.result.id);
                assert(res.body.result.name);
                callback(err);
              });
          },
        ], done);
      });

      it("should create entry using provided id", function (done) {
        async.series([
          function(callback){

            var personDoc = person({ id: 'test', name: "Joe Bloggs" });
            request
              .post("/api/persons")
              .send(personDoc)
              .expect(200)
              .expect({ result: personDoc })
              .end(callback);
          },
          function(callback){
            request
              .get('/api/persons/test')
              .expect(200)
              .expect({ result: person({ id: 'test', name: "Joe Bloggs" }) })
              .end(callback);
          },
        ], done);
      });

      it("should error when not valid (bad name)", function (done) {
        request
          .post("/api/persons")
          .send({ name: 123, meme: "Harlem Shake" }) // name should be string
          .expect(400)
          .expect("Content-Type", "application/json; charset=utf-8")
          .expect({
            errors: [ "Error 'Instance is not a required type' with 'http://popoloproject.com/schemas/person.json#/properties/name'." ]
          })
          .end(done);
      });

      it("should error when not valid (missing name)", function (done) {
        request
          .post("/api/persons")
          .send({ meme: "Harlem Shake" }) // no name
          .expect(400)
          .expect("Content-Type", "application/json; charset=utf-8")
          .expect({
            errors: [ "Error 'Property is required' with 'http://popoloproject.com/schemas/person.json#/properties/name'." ]
          })
          .end(done);
      });

      it("should accept arbitrary fields and save them", function(done) {
        request
          .post("/api/persons")
          .send({id: 'test', name: 'Test', meme: 'Harlem Shake', tags: ['music', 'shaking']})
          .expect(200)
          .expect({
            result: person({id: 'test', name: 'Test', meme: 'Harlem Shake', tags: ['music', 'shaking']})
          }, done);
      });

    });

    describe("PUT", function () {
      it("should 405", function (done) {
        request
          .put("/api/persons")
          .send([{id: "test", name: "Foo"}])
          .expect(405)
          .end(done);
      });
    });

    describe("DELETE", function () {
      it("should 405", function (done) {
        request
          .del("/api/persons")
          .expect(405)
          .end(done);
      });
    });

  });

  describe("/api/collectionName/id", function () {

    describe("GET", function () {

      beforeEach(fixture.loadFixtures);

      it("should 200 when doc exists", function (done) {
        request
          .get("/api/persons/fred-bloggs")
          .expect(200, done);
      });

      it("should 404 when doc does not exist", function (done) {
        request
          .get("/api/persons/i-do-not-exist")
          .expect(404)
          .expect({
            errors: [ "id 'i-do-not-exist' not found" ]
          })
          .end(done);
      });

    });

    describe("POST", function () {
      it("should 405", function (done) {
        request
          .post("/api/persons/does-not-exist")
          .send({name: "Foo"})
          .expect(405)
          .end(done);
      });
    });

    describe("PUT", function () {

      it("should create entry and return Location when valid", function (done) {
        async.series([
          function(callback){
            request
              .put("/api/persons/test")
              .send({ name: "Joe Bloggs" })
              .expect(200)
              .expect({ result: person({ id: "test", name: "Joe Bloggs" }) })
              .end(callback);
          },
          function(callback){
            request
              .get("/api/persons/test")
              .expect(200)
              .expect({ result: person({ id: "test", name: "Joe Bloggs" }) })
              .end(callback);
          },
          function(callback){
            request
              .put("/api/persons/test")
              .send({ id: 'test', name: "Fred Smith" })
              .expect(200)
              .expect({ result: person({ id: "test", name: "Fred Smith" }) })
              .end(callback);
          },
          function(callback){
            request
              .get("/api/persons/test")
              .expect(200)
              .expect({ result: person({ id: "test", name: "Fred Smith" }) })
              .end(callback);
          },
        ], done);
      });

      it("should error if url id and doc id differ", function (done) {
        request
          .put("/api/persons/test")
          .send({ id: "different", name: "Joe Bloggs" })
          .expect(400)
          .expect({errors: ["URL id and document id are different"]})
          .end(done);
      });

      it("should error when not valid (bad name)", function (done) {
        request
          .put("/api/persons/test")
          .send({ name: 123, meme: "Harlem Shake" }) // name should be string
          .expect(400)
          .end(done);
      });

    });


    describe("DELETE", function () {

      beforeEach(fixture.loadFixtures);

      it("document that does exist", function (done) {
        async.series([
          function(callback){
            request
              .del("/api/persons/fred-bloggs")
              .expect(204)
              .end(callback);
          },
          function(callback){
            request
              .get('/api/persons/fred-bloggs')
              .expect(404)
              .end(callback);
          },
        ], done);
      });

      it("document that does not exist", function (done) {
        request
          .del("/api/persons/does-not-exist")
          .expect(204)
          .end(done);
      });

    });

  });

  describe("GET /search/:collection", function() {
    this.timeout(5000);

    beforeEach(dropElasticsearchIndex(defaults.databaseName.toLowerCase()));

    beforeEach(function(done) {
      mongoose.model('Person').create({
        _id: 'bby',
        id: 'bby',
        name: 'Barnaby',
        email: 'barnaby@example.org'
      }, function(err, doc) {
        if (err) {
          return done(err);
        }
        doc.on('es-indexed', done);
      });
    });

    beforeEach(refreshElasticsearchIndex(defaults.databaseName.toLowerCase()));

    it("returns names when searching", function(done) {
      request.get('/api/search/persons?q=Barnaby')
      .expect(200)
      .expect({
        total: 1,
        page: 1,
        per_page: 30,
        has_more: false,
        result: [
          person({id: 'bby', name: 'Barnaby', email: 'barnaby@example.org'})
        ]
      }, done);
    });

    describe("'url' property", function() {
      var apiRequest;
      before(function() {
        apiRequest = supertest(apiApp({
          databaseName: defaults.databaseName,
          apiBaseUrl: 'http://example.org'
        }));
      });

      it("is formatted correctly", function(done) {
        apiRequest.get('/search/persons?q=Barnaby')
        .expect(200)
        .end(function(err, res) {
          assert.ifError(err);
          assert.equal(res.body.result[0].url, 'http://example.org/persons/bby');
          done();
        });
      });
    });
  });

  describe("deduplicating slugs", function() {
    beforeEach(function(done) {
      request.post('/api/persons')
      .send({id: 'foo', name: 'Test', slug: 'test'})
      .expect(200, done);
    });

    it("appends a number for a duplicate slug", function(done) {
      request.post('/api/persons')
      .send({id: 'bar', name: 'Test', slug: 'test'})
      .expect({result: person({id: 'bar', name: 'Test', slug: 'test-1'})})
      .expect(200, function(err) {
        if (err) {
          return done(err);
        }
        request.post('/api/persons')
        .send({id: 'baz', name: 'Test', slug: 'test'})
        .expect({result: person({id: 'baz', name: 'Test', slug: 'test-2'})})
        .expect(200, done);
      });
    });
  });

  describe("api links", function() {
    beforeEach(fixture.loadFixtures);

    describe("without correct configuration", function() {
      it("doesn't include links", function(done) {
        request.get('/api/persons/joe-bloggs')
        .expect(200)
        .end(function(err, res) {
          assert.ifError(err);
          assert(!res.body.result.url);
          assert(!res.body.result.html_url);
          done();
        });
      });
    });

    describe("with correct configuration", function() {
      var app;

      beforeEach(function() {
        app = supertest(apiApp({
          databaseName: defaults.databaseName,
          apiBaseUrl: 'http://example.com/api',
          baseUrl: 'http://example.com'
        }));
      });

      it("includes 'url' links when configured correctly", function(done) {
        app.get('/persons/joe-bloggs')
        .expect(200)
        .end(function(err, res) {
          assert.ifError(err);
          assert.equal(res.body.result.url, 'http://example.com/api/persons/joe-bloggs');
          done();
        });
      });

      describe("html_url", function() {
        beforeEach(function(done) {
          app.post('/persons')
          .send({id: 'test', name: 'Test', slug: 'test-person'})
          .expect(200)
          .end(done);
        });

        it("doesn't include 'html_url' when doc has no slug", function(done) {
          app.get('/persons/joe-bloggs')
          .expect(200)
          .end(function(err, res) {
            assert.ifError(err);
            assert(!res.body.result.html_url);
            done();
          });
        });

        it("is included for documents with a slug", function(done) {
          app.get('/persons/test')
          .expect(200)
          .end(function(err, res) {
            assert.ifError(err);
            assert.equal(res.body.result.html_url, 'http://example.com/persons/test-person');
            done();
          });
        });
      });

      describe("embedded documents 'url' property", function() {
        it("is correct", function(done) {
          app.get('/persons/fred-bloggs')
          .expect(200)
          .end(function(err, res) {
            assert.ifError(err);
            assert.equal(res.body.result.memberships[0].url, 'http://example.com/api/memberships/oldMP');
            done();
          });
        });
      });
    });
  });

  describe("pagination", function() {

    beforeEach(function(done) {
      var Person = mongoose.model('Person');
      async.times(40, function(n, next) {
        Person.create({_id: n, name: "Person " + n}, next);
      }, done);
    });

    it("defaults to 30 results", function(done) {
      request.get('/api/persons')
      .expect(200)
      .end(function(err, res) {
        if (err) {
          return done(err);
        }
        assert.equal(res.body.result.length, 30);
        assert.equal(res.body.total, 40);
        assert.equal(res.body.per_page, 30);
        assert.equal(res.body.page, 1);
        assert.equal(res.body.has_more, true);
        done();
      });
    });

    it("allows specifying a 'per_page' parameter", function(done) {
      request.get('/api/persons?per_page=10')
      .expect(200)
      .end(function(err, res) {
        if (err) {
          return done(err);
        }
        assert.equal(res.body.result.length, 10);
        assert.equal(res.body.total, 40);
        assert.equal(res.body.per_page, 10);
        assert.equal(res.body.page, 1);
        assert.equal(res.body.has_more, true);
        done();
      });
    });

    it("allows specifying a 'page' parameter", function(done) {
      request.get('/api/persons?page=2')
      .expect(200)
      .end(function(err, res) {
        if (err) {
          return done(err);
        }
        assert.equal(res.body.result.length, 10);
        assert.equal(res.body.total, 40);
        assert.equal(res.body.per_page, 30);
        assert.equal(res.body.page, 2);
        assert.equal(res.body.has_more, false);

        done();
      });
    });

    it("allows specifying both pagination parameters", function(done) {
      request.get('/api/persons?per_page=39&page=2')
      .expect(200)
      .end(function(err, res) {
        if (err) {
          return done(err);
        }
        assert.equal(res.body.result.length, 1);
        done();
      });
    });

    describe("next_url/prev_url", function() {
      var app;
      beforeEach(function() {
        app = supertest(apiApp({
          databaseName: defaults.databaseName,
          apiBaseUrl: 'http://example.com'
        }));
      });

      it("adds next_url when there are more results", function(done) {
        app.get('/persons')
        .expect(200)
        .end(function(err, res) {
          assert.ifError(err);
          assert(res.body.has_more);
          assert(!res.body.prev_url);
          assert.equal(res.body.next_url, 'http://example.com/persons?page=2');
          done();
        });
      });

      it("adds prev_url when not on the first page", function(done) {
        app.get('/persons?page=2')
        .expect(200)
        .end(function(err, res) {
          assert.ifError(err);
          assert(!res.body.has_more);
          assert.equal(res.body.prev_url, 'http://example.com/persons?page=1');
          assert(!res.body.next_url);
          done();
        });
      });

      it("preserves the rest of the query string", function(done) {
        app.get('/persons?per_page=10')
        .expect(200)
        .end(function(err, res) {
          assert.ifError(err);
          assert(res.body.has_more);
          assert.equal(res.body.next_url, 'http://example.com/persons?per_page=10&page=2');
          assert(!res.body.prev_url);
          done();
        });
      });
    });
  });

  describe("removing the API's root wrapper", function() {
    beforeEach(fixture.loadFixtures);

    it("works for GET /:collection/:id", function(done) {
      request.get('/api/persons/fred-bloggs?include_root=false')
      .expect(200)
      .end(function(err, res) {
        assert.ifError(err);
        assert.equal(res.body.name, "Fred Bloggs");
        done();
      });
    });

    it("works for PUT /:collection/:id", function(done) {
      request.put('/api/persons/fred-bloggs?include_root=false')
      .send({name: 'Fred Bloggs'})
      .expect(200)
      .end(function(err, res) {
        assert.ifError(err);
        assert.equal(res.body.name, "Fred Bloggs");
        done();
      });
    });

    it("works for POST /:collection", function(done) {
      request.post('/api/persons?include_root=false')
      .send({name: 'Bob Example'})
      .expect(200)
      .end(function(err, res) {
        assert.ifError(err);
        assert.equal(res.body.name, "Bob Example");
        done();
      });
    });

  });

});
