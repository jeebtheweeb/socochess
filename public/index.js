'use strict';

var JEB_CHESS_URL = 'https://jeb-chess.sites.tjhsst.edu/';

var routes = require('../routes');
const express = require('express');
const path = require('path');
const { createServer } = require('http');
var https = require('https');

const ws = require('ws');

const app = express();
app.use(express.static("../public"));

var passport = require('passport')
var mysql = require('mysql');
class Database {
    constructor( config ) {
        this.connection = mysql.createConnection( config );
    }
    query( sql, args ) {
        return new Promise( ( resolve, reject ) => {
            this.connection.query( sql, args, ( err, rows ) => {
                if ( err )
                    return reject( err );
                resolve( rows );
            } );
        } );
    }
    close() {
        return new Promise( ( resolve, reject ) => {
            this.connection.end( err => {
                if ( err )
                    return reject( err );
                resolve();
            } );
        } );
    }
}

var database = new Database({
    host: process.env.DIRECTOR_DATABASE_HOST,
    user: process.env.DIRECTOR_DATABASE_USERNAME,
    password: process.env.DIRECTOR_DATABASE_PASSWORD,
    database: process.env.DIRECTOR_DATABASE_NAME
})

var cookieSession = require('cookie-session');
const {AuthorizationCode} = require('simple-oauth2');
var GoogleStrategy = require('passport-google-oauth20').Strategy;
var GOOGLE_CLIENT_ID     = '221807810876-crak3hle4q6dsti76vb00tf9mir3uj7e.apps.googleusercontent.com';
var GOOGLE_CLIENT_SECRET = '44XG9hKl3Ywg8c5mebiJV293';
var google_redirect_uri  = 'https://socochess.sites.tjhsst.edu/login_helper';
var userProfile = "";

app.use(cookieSession({name: "google-cookie", keys: ['googleauthKey', 'secretionauthKey', 'superduperextrasecretcookiegoogleKey'], maxAge: 36000000}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user.id);
});
passport.deserializeUser((id, done) => {
    done(null, id);
});
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: google_redirect_uri
},
function(accessToken, refreshToken, profile, cb) {
    //console.log(res.locals.userProfile)
    return cb(null, profile);
}
));

app.get("/login", passport.authenticate("google", {scope: ["profile", "email"]}));

//warnings are due to async keyword.
app.get('/login_helper', passport.authenticate("google"), async (req,res)=>{
    userProfile = req.user
    try{
        let results = await database.query("SELECT id FROM chess_players")
        let newUser = true;
        console.log("results: ", results);
        for (let x=0; x<results.length; x++){
            console.log(results[x].id, " --- ", req.user.id);
            if (results[x].id === req.user.id){
                newUser = false;
                break;
            }
        }
    
    
        //insert new user into chess_players ONLY IF they aren't in chess_players
        if (newUser){
            let userData = {personal:{}, chess:{}};
            userData.personal.id = req.user.id;
            userData.personal.name = req.user.displayName;
            userData.personal.email = req.user.emails[0].value;
            userData.chess.games_won = 0;
            userData.chess.games_lost = 0;
            userData.chess.current_game = "";
            userData.chess.game_history = [];
            var sql = "INSERT INTO chess_players (id, name, data) VALUES (\'"+req.user.id+"\', \'"+req.user.displayName+"\', \'"+JSON.stringify(userData)+"\')";
            console.log(sql);
            await database.query(sql)
        }
        res.redirect('/');
    }
    catch(err){
     console.log(err);
     res.redirect("/login")
    }
});

app.get('/', async function (req, res) {
    console.log('user landed at main page');

    let obj = {}

    let dater = new Date();
    let month = dater.getMonth() + 1;
    let date = dater.getDate();
    let year = dater.getFullYear();
    console.log("\tGot date as: " + month + "/" + date + "/" + year);
    passport.authenticate("google")
    if (req.user){
        let userData = await database.query("SELECT data FROM chess_players WHERE id=\'"+req.user+"\'")
        res.render('index.hbs', JSON.parse(userData[0].data));//, JSON.parse(userData[0].data)) 
    }
    else{
        //res.redirect('/login')
        //let userData = await database.query("SELECT data FROM chess_players WHERE id=\'"+req.user+"\'")
        res.redirect('/login');//, JSON.parse(userData[0].data))
    }
});

//routes.do_setup(app);

app.get('*', function (req, res) {
    res.status(404).send('Someone did an oopsie! you tried to go to ' + req.protocol + '://' + req.get('host') + req.originalUrl);
});

const server = createServer(app);
const wss = new ws.WebSocket.Server({ server });

wss.on('connection', function (ws) {
    ws.send(JSON.stringify({pgn: "OPEN"}))
    ws.on('error', (error)=>{
        console.log('error:', error.message);
    })
    ws.on('message', function (messages) {
        console.log(messages);
        console.log("BRUHHHH--- ",String.fromCharCode.apply(null, new Uint16Array(messages)));
        let mes = String.fromCharCode.apply(null, new Uint16Array(messages))
        let m = JSON.parse(mes);
        console.log(m)
        let ret = {};
        let dat = '';
        if(m.message){
            if(m.message === "request_move_1"){
                let options = {headers:{'User-Agent': 'request'}};
                https.get(JEB_CHESS_URL + "ai1?pgn=" + m.pgn + "&t=5", options, function(response){
                    response.on('data', function(chunk){
                        dat+=chunk;
                        console.log("DAT= " + dat)
                    })
                    response.on('end', function(){
                        ret = {move:dat}
                        console.log("\n-----\n"+ret);
                        ws.send(JSON.stringify(ret));
                    })
                })
            }
            else if(m.message === "request_move_2"){
                let options = {headers:{'User-Agent': 'request'}};
                https.get(JEB_CHESS_URL + "ai2?pgn=" + m.pgn + "&t=5", options, function(response){
                    response.on('data', function(chunk){
                        dat+=chunk;
                        console.log("DAT= " + dat)
                    })
                    response.on('end', function(){
                        ret = {move:dat}
                        console.log("\n-----\n"+ret);
                        ws.send(JSON.stringify(ret));
                    })
                })
            }
            else if(m.message === "request_pgn"){
                //send pgn.
            }
        }
    })
//     const id = setInterval(function () {
//     //ws.send(JSON.stringify(process.memoryUsage()), function () {
//       //
//       //
//     //});
//   }, 1000);
  console.log('started client interval');

  ws.on('close', function () {
    console.log('stopping client interval');
    //clearInterval(id);
  });
  
  ws.on('error', (error)=>{
      console.log('error:', error.message);
  })
});

server.listen(process.env.PORT || 8080, process.env.HOST || "0.0.0.0", function () {
  console.log('Listening on port 8080');
});