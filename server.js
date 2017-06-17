const
  Promise     = require('bluebird'),
  request     = require('request'),
  FeedParser  = require('feedparser'),
  mysql = require('mysql');


const connection = mysql.createConnection({
  multipleStatements: true,
  host: "localhost",
  user: "root",
  password: "langmaid5137",
  database: "peruse_news"
});

const slugify = (title) => { console.log(title);	
 return title.toLowerCase().replace(/[^\w ]+/g,'').replace(/ +/g,'-');
}


const fetch = (url) => {
  return new Promise((resolve, reject) => {
    if (!url) { return reject(new Error(`Bad URL (url: ${url}`)); }

    const
      feedparser = new FeedParser(),
      items     = [];

    feedparser.on('error', (e) => {
      return reject(e);
    }).on('readable', () => {
      
      var item;

      while (item = feedparser.read()) {
        items.push(item)
      }
    }).on('end', () => {
      resolve({
        meta: feedparser.meta,
        records: items
      });
    });

    request({
      method: 'GET',
      url: url
    }, (e, res, body) => {
      if (e) {
        return reject(e);
      }

      if (res.statusCode != 200) {
        return reject(new Error(`Bad status code (status: ${res.statusCode}, url: ${url})`));
      }

      feedparser.end(body);
    });
  });
};

var insert_array = [];

const insert = (db, data) => {

	var url = data['rss:link']['#'];
	var post_link = url.slice(0, -1);

	var link = 	url,
			slug = post_link.substr(post_link.lastIndexOf('/') + 1),
			title = data.title,
			content = (data.description) ? data.description : '',
			author = (data.author && data.author !== '&nbsp;') ? data.author : '',
			summary = (data.summary) ? data.summary : '',
			pubdate = data.pubdate,
			image = (data['rss:image']) ? data['rss:image']['#'] : '',
			categories = data.categories;

	
	//Battle off dupe articles
  if(insert_array.indexOf(link) !== -1){
  	console.log(title + ' already saved bro.');
  	return;
  }

	insert_array.push(link);		

	db.beginTransaction(function(err) {
    if (err) { throw err; }

		var select = "SELECT post_id FROM wp_postmeta WHERE wp_postmeta.meta_key = 'url' AND wp_postmeta.meta_value = '"+link+"'";
	  db.query(select, function (error, results, fields) {

      if (error) {
        return db.rollback(function() {
          throw error;
        });
      }

      //Article already exists
      if(results[0]){
        console.log(link + ' is already saved to post ' + results[0].post_id);
        return;
      }

      var insert_post  = {
        post_author: 1, 
        post_name: slug,
        post_date: pubdate, 
        post_content: content,
        post_excerpt: summary,
        to_ping: '',
        post_title: title,
        post_status: 'publish',
        post_type: 'post',
        pinged: '',
        post_content_filtered: ''
      };

      db.query('INSERT INTO wp_posts SET ?', insert_post, function (error, post_results, fields) {
        if (error) {
          return db.rollback(function() {
            throw error;
          });
        }
        db.commit(function(err) {
          if (err) {
            return db.rollback(function() {
              throw err;
            });
          }

          var author_clean = author.replace(/'/g, "\\'");

          var meta_insert = "INSERT INTO wp_postmeta (post_id, meta_key, meta_value) values ('"+post_results.insertId+"', 'url', '"+link+"'), ('"+post_results.insertId+"', 'image', '"+image+"'), ('"+post_results.insertId+"', 'author', '"+author_clean+"')";

          db.query(meta_insert, function (error, meta_results, fields) {
            if (error) {
              return db.rollback(function() {
                throw error;
              });
            }
            db.commit(function(err) {
              if (err) {
                return db.rollback(function() {
                  throw err;
                });
              }
             

              var cat_clean = '"' + categories.join('","').replace("&", "&amp;").replace(/'/g, "\\'") + '"';

              var cat_select = "SELECT term_id FROM wp_terms WHERE name IN ("+cat_clean+")";



              db.query(cat_select, function (error, cat_results, fields) {
                if (error) {
                  return db.rollback(function() {
                    throw error;
                  });
                }
                db.commit(function(err) {
                  if (err) {
                    return db.rollback(function() {
                      throw err;
                    });
                  }
                	
                	var cats = []


                	if(cat_results.length === 0){
                		console.log('post ' + post_results.insertId + ' had trouble setting the cat: '+ categories);

                		// var slug = slugify(categories);
                		// var new_cat = "INSERT INTO wp_terms (name, slug) values ('"+categories+"', '"+slug+"')";

                		cat_results = [{term_id:1}];

                	}

                  for (var i = 0; i<cat_results.length; i++) { 
                  		cats.push(cat_results[i].term_id);
									}

									var catIDs = "("+post_results.insertId+","+cats.join("),("+post_results.insertId+",") + ")";

									var cat_insert = "INSERT INTO wp_term_relationships (object_id, term_taxonomy_id) values " + catIDs;

									db.query(cat_insert, function (error, results, fields) {
		                if (error) {
		                  return db.rollback(function() {
		                    throw error;
		                  });
		                }
		                db.commit(function(err) {
		                  if (err) {
		                    return db.rollback(function() {
		                      throw err;
		                    });
		                  }
		                		
		                  	console.log('article saved');
		                  
		                });
		              });


                  
                });
              });


              
              
            });
          });

        });
      });

  });
  });


}


Promise.map([
  'http://www.pressherald.com/category/news/feed/',
  'http://www.pressherald.com/category/business/feed/',
  'http://www.pressherald.com/category/sports/feed/',
  'http://www.pressherald.com/category/opinion/feed/',
  'http://www.pressherald.com/category/foodanddining/feed/',
  'http://www.pressherald.com/category/life/feed/'
], (url) => fetch(url))
.then((feeds) => {
 	
	connection.connect(function(err) {
    if (err) throw err;
    console.log("Connected!");


		for(var i = 0; i<feeds.length; i++){
			for(var x = 0; x<feeds[i].records.length; x++){

				insert(connection, feeds[i].records[x]);
			
			}
		}

	});

});



