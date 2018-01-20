// server.js
// where your node app starts

// init project
var express = require('express');
var app = express();
var bodyparser = require("body-parser");
var mongo = require("mongodb");
var ObjectId = require("mongodb").ObjectID
var mClient = require("mongodb").MongoClient;
var pug = require("pug");
var session = require("express-session");
var req = require("request");


var mongo_url = process.env.MONGO_URL;
var api_key = process.env.BOOK_KEY

app.set("view engine","pug");

// parse application/x-www-form-urlencoded 
app.use(bodyparser.urlencoded({ extended: false }))

//session middleware
app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false,
}))

//local variable middleware for sessions
app.use(function(request,response,next) {
  response.locals.currentUser = request.session.userId;
  next();
})

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));


//MUST ADD SESSION STORE FOR LIVE USE========================================================




//-------------------------------------- GET ROUTES -----------------------------------------

app.get("/", function (request, response) {
  
  //find all users books and render the array thereof to the index
  mClient.connect(mongo_url,function(error,database) {
    if(error)throw error
    var book_arr = []
    database.collection("user-data").find().toArray(function(error,data) {
      if(error)throw error;
      for(var item in data) {
        for(var i=0;i < data[item].user_info.books.length;i++) {
          book_arr.push(data[item].user_info.books[i]);
        }
      }
      
      response.render("index",{book_arr: book_arr})
    })
  })
  
});

app.get("/login",function(request,response) {
  response.render("login")
})

app.get("/signup",function(request,response) {
  response.render("signup")
})

app.get("/logout",function(request,response) {
  request.session.destroy(function(error) {
    if(error)throw error;
    response.redirect("/")
  })
})

app.get("/my-books",function(request,response) {
  
  //get the book array for the user from db and render to my-books view
  mClient.connect(mongo_url,function(error,database) {
    if(error)throw error;
    database.collection("user-data").find({_id: ObjectId(request.session.userId)}).toArray(function(error,data) {
      var book_arr = data[0].user_info.books
      response.render("my-books",{book_arr: book_arr})
    })
  })
  
})

app.get("/my-requests",function(request,response) {
  mClient.connect(mongo_url,function(error,database) {
    if(error)throw error;
    database.collection("user-data").find({_id: ObjectId(request.session.userId)}).toArray(function(error,data) {
      if(error)throw error;
      var requests = data[0].user_info.requests
      var accepted = data[0].user_info.accepted
      return response.render("my-requests",{book_requests: requests,accepted_books : accepted})
    })
  })
})

app.get("/profile",function(request,response) {
  response.render("profile")
})
//-------------------------------------------------------------------------------------------


//-------------------------------------- POST ROUTES ----------------------------------------

app.post("/signup",function(request,response) {
  
  //render an error because fields were left empty
  for(var item in request.body) {
    if(request.body[item].trim() == "") {
      return response.render("signup",{error: "fields cannot be empty"})
    }
  }
  
  //render an error because passwords do not match
  if(request.body.pass1 != request.body.pass2) {
    return response.render("signup",{error: "passwords do not match"})
  }
  
  var user_info = {
    username: request.body.user,
    email: request.body.email,
    //UNHASHED PASSWORD, MUST BE CHANGED FOR LIVE USE====================================================
    password: request.body.pass1,
    books: [],
    requests: [],
    accepted: [],
    full_name : "",
    city : "",
    state : ""
  }
  
  //check for email and username in db, if neither are already in use push info to db
  mClient.connect(mongo_url,function(error,database) {
    if(error) throw error;
    database.collection("user-data").find({"user_info.email" : user_info.email}).toArray(function(error,data) {
      if(error)throw error;
      if(data != "") {
        response.render("signup",{error: "email is already in use"})
      }
      else {
        database.collection("user-data").find({"user_info.username" : user_info.username}).toArray(function(error,data) {
          if(error)throw error;
          if(data != "") {
            response.render("signup",{error: "username is already in use"})
          }
          else {
            database.collection("user-data").insertOne({user_info})
            response.redirect("/login")
          }
        })
      }
    })
  })
  
  
})

app.post("/login",function(request,response) {
  if(request.body.user.trim() == "" || request.body.pass.trim() == "") {
    return response.render("login",{error: "fields cannot be empty"})
  }
  
  mClient.connect(mongo_url,function(error,database) {
    if(error)throw error;
    
    database.collection("user-data").find({"user_info.username" : request.body.user}).toArray(function(error,data) {
      if(error)throw error;
      
      if(data == "") {
        return response.render("login",{error: "user does not exist"})
      }
      else if(request.body.pass != data[0].user_info.password) {
        return response.render("login",{error: "Incorrect Password"})
      }
      else {
        //initialise session
        request.session.userId = data[0]._id
        response.redirect("/")
      }
    })
  })
})

app.post("/add-book",function(request,response) {
  var userId = request.session.userId
  var searchTerm = request.body.book_title
  
  //use google books api to find book thumbnail
  req("https://www.googleapis.com/books/v1/volumes?q=" + searchTerm,function(error,res,body) {
    var result = JSON.parse(body);
    var book_thumbnail_url = result.items[0].volumeInfo.imageLinks.smallThumbnail
    
    var book_data = {
      title: searchTerm,
      thumb: book_thumbnail_url,
      user: request.session.userId
    }
    
    mClient.connect(mongo_url,function(error,database) {
      if(error)throw error;
      database.collection("user-data").update({_id: ObjectId(userId)},{$push : {"user_info.books": book_data}})
      response.redirect("/my-books")
      })
  })
})


app.post("/delete-book",function(request,response) {
  var userId = request.session.userId;
  
  mClient.connect(mongo_url,function(error,database) {
    if(error)throw error;
    
    //pull book from book array based on title passed in through button == request.body.book_title
    database.collection("user-data").update({_id: ObjectId(userId)},{$pull: {"user_info.books" : {"title" : request.body.book_title}}})
    response.redirect("/my-books")
  })
})

app.post("/req-trade",function(request,response) {
  
    var book_request = {
      book_title: request.body["book_title"]
    }
    
    if(request.session.userId == request.body.user) {
      return response.render("index",{error: "You cannot request your own book"})
    }
    
    mClient.connect(mongo_url,function(error,database) {
      
      //lookup the username of the sessionID and then push book request info to the owner of the books data
      database.collection("user-data").find({_id: ObjectId(request.session.userId)}).toArray(function(error,data) {
        
        book_request.user = data[0].user_info.username;
        database.collection("user-data").update({_id: ObjectId(request.body.user)},{$push: {"user_info.requests" : book_request} })
        response.render("index",{error: "book succesfully requested"})
        
      })
    })
  
})

app.post("/book-req-accept",function(request,response) {
  
  var option = request.body.option
  var user = request.body.user
  var title = request.body.title
  
  var accepted_object = {
    book : title
  }
  
  
  if(option == "accept") {
    mClient.connect(mongo_url,function(error,database) {
      if(error)throw error;
      database.collection("user-data").find({_id: ObjectId(request.session.userId)}).toArray(function(error,data) {
        if(error)throw error;
        accepted_object.user = data[0].user_info.username
        //push data onto the accepted array of the user who requested the book
        database.collection("user-data").update({"user_info.username" : user},{$push : {"user_info.accepted" : accepted_object}})
        
        //remove the data from the request and book arrays of the user who recieved the request
        database.collection("user-data").update({_id : ObjectId(request.session.userId)},{$pull : {"user_info.requests" : {"book_title" : title}}})
        database.collection("user-data").update({_id : ObjectId(request.session.userId)},{$pull : {"user_info.books" : {"title" : title}}})
        response.redirect("/my-requests")
      })
    })
  }
  
  else {
    //if the request was declined pull the request from the users request array
    mClient.connect(mongo_url,function(error,database) {
      database.collection("user-data").update({_id : ObjectId(request.session.userId)},{$pull : {"user_info.requests" : {"book_title" : title}}})
    })
  }
  
})

//update the profile info on the database 
app.post("/update-profile",function(request,response) {
  mClient.connect(mongo_url,function(error,database) {
    database.collection("user-data").update({_id: ObjectId(request.session.userId)},{$set: {
      "user_info.full_name" : request.body.full_name,
      "user_info.city" : request.body.city,
      "user_info.state": request.body.state
    }})
  })
  response.render("profile",{error: "Profile updated succesfully"})
})
//-------------------------------------------------------------------------------------------
// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
