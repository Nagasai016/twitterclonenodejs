const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const filepath = path.join(__dirname, "twitterClone.db");

let db;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: filepath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Running...");
    });
  } catch (e) {
    console.log(`${e.message}`);
  }
};
initializeDBAndServer();

const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "Nagasai", async (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payLoad.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const query = `SELECT * FROM user WHERE username='${username}'`;
  const hashedPassword = await bcrypt.hash(password, 10);
  const userQuery = await db.get(query);
  if (userQuery === undefined) {
    if (password.length < 6) {
      response.status(400).send("Password is too short");
    } else {
      const addQuery = `INSERT INTO user(name,username,password,gender) VALUES('${name}','${username}','${hashedPassword}','${gender}')`;
      await db.run(addQuery);
      response.status(200).send("User created successfully");
    }
  } else {
    response.status(400).send("User already exists");
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const user = `SELECT * FROM USER WHERE username='${username}'`;
  const getUser = await db.get(user);
  if (getUser !== undefined) {
    const comparePassword = await bcrypt.compare(password, getUser.password);
    if (comparePassword) {
      const payLoad = { username: username };
      const jwtToken = jwt.sign(payLoad, "Nagasai");
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400).send("Invalid password");
    }
  } else {
    response.status(400).send("Invalid user");
  }
});

//api 3
//Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id from user where username='${username}'`;
  const id = await db.get(userIdQuery);
  const userId = id.user_id;
  const query = `SELECT username,tweet,date_time as dateTime FROM (tweet INNER JOIN follower ON tweet.user_id=follower.following_user_id ) as T INNER JOIN user ON T.user_id=user.user_id WHERE follower_user_id=${userId} ORDER BY dateTime DESC LIMIT 4`;
  const array = await db.all(query);
  response.send(array);
});

app.get("/user/following", authentication, async (request, response) => {
  const { username } = request;
  const query = `SELECT name FROM user INNER JOIN follower ON user_id=following_user_id WHERE follower_user_id=(SELECT user_id FROM USER WHERE username='${username}');`;
  const array = await db.all(query);
  response.send(array);
});
app.get("/user/followers", authentication, async (request, response) => {
  const { username } = request;
  const query = `SELECT name FROM user INNER JOIN follower ON user_id=follower_user_id WHERE following_user_id=(SELECT user_id FROM USER WHERE username='${username}');`;
  const array = await db.all(query);
  response.send(array);
});

app.get("/tweets/:tweetId", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const userIdQuery = `SELECT user_id from user where username='${username}'`;
  const id = await db.get(userIdQuery);
  const userId = id.user_id;

  const query = `SELECT user_id from tweet INNER JOIN follower ON tweet.user_id=following_user_id
   WHERE follower_user_id=${userId} and tweet_id=${tweetId};`;
  const getQuery = await db.get(query);
  if (getQuery === undefined) {
    response.status(401).send("Invalid Request");
  } else {
    const Query = `SELECT T1.tweet,likes,replies,T1.dateTime FROM
    (SELECT tweet,count(like_id) as likes,date_time as dateTime FROM tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id WHERE tweet.tweet_id=${tweetId} GROUP BY tweet.tweet_id) as T1 
    INNER JOIN
    (SELECT tweet,count(reply_id) as replies,date_time as dateTime FROM tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id WHERE tweet.tweet_id=${tweetId} GROUP BY tweet.tweet_id) as T2
    ON t1.tweet=t2.tweet;
    `;
    const getquery = await db.get(Query);
    response.send(getquery);
  }
});

app.get("/tweets/:tweetId/likes", authentication, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  let query;
  query = `SELECT * FROM tweet INNER JOIN follower ON tweet.user_id=following_user_id WHERE follower_user_id=(SELECT user_id FROM USER WHERE username='${username}') and tweet_id=${tweetId}`;
  const getQuery = await db.get(query);
  if (getQuery === undefined) {
    response.status(401).send("Invalid Request");
  } else {
    query = `SELECT username FROM like INNER JOIN user ON like.user_id=user.user_id WHERE tweet_id=${tweetId}`;
    const array = await db.all(query);
    const getLikedUserNames = array.map((eachUser) => {
      return eachUser.username;
    });
    response.send({ likes: getLikedUserNames });
  }
});

app.get(
  "/tweets/:tweetId/replies",
  authentication,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    let query;
    query = `SELECT * FROM tweet INNER JOIN follower ON tweet.user_id=following_user_id WHERE follower_user_id=(SELECT user_id FROM USER WHERE username='${username}') and tweet_id=${tweetId}`;
    const getQuery = await db.get(query);
    if (getQuery === undefined) {
      response.status(401).send("Invalid Request");
    } else {
      query = `SELECT name,reply FROM reply INNER JOIN user ON reply.user_id=user.user_id WHERE tweet_id=${tweetId}`;
      const array = await db.all(query);
      const obj = array.map((eachUser) => {
        return { name: eachUser.name, reply: eachUser.reply };
      });
      response.send({ replies: obj });
    }
  }
);

//api 9
app.get("/user/tweets/", authentication, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id from user where username='${username}'`;
  const id = await db.get(userIdQuery);
  const userId = id.user_id;
  const query = `select T1.tweet,likes,replies,T1.dateTime from 
  (SELECT tweet,count(like_id) as likes,date_time as dateTime FROM tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id WHERE tweet.user_id=${userId} GROUP BY like.tweet_id) as T1 
  INNER JOIN 
  (SELECT tweet,count(reply_id) as replies,date_time as dateTime FROM tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id WHERE tweet.user_id=${userId} GROUP BY reply.tweet_id) as T2
   ON T1.tweet=T2.tweet;`;

  const array = await db.all(query);
  response.send(array);
});

app.post("/user/tweets", authentication, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const userIdQuery = `SELECT user_id from user where username='${username}'`;
  const id = await db.get(userIdQuery);
  const userId = id.user_id;
  const dateTime = new Date().toISOString().replace("T", " ");
  const query = `INSERT INTO tweet(tweet,user_id,date_time) VALUES('${tweet}',${userId},'${dateTime}')`;
  await db.run(query);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const userIdQuery = `SELECT user_id from user where username='${username}'`;
  const id = await db.get(userIdQuery);
  const userId = id.user_id;

  const userTweets = `SELECT tweet_id from tweet WHERE user_id=${userId}`;
  const userTweetsArray = await db.all(userTweets);
  const userTweetsArrayObj = userTweetsArray.map((ele) => {
    return ele.tweet_id;
  });
  if (userTweetsArrayObj.includes(parseInt(tweetId))) {
    const query = `DELETE FROM tweet WHERE tweet_id=${tweetId};`;
    await db.run(query);
    response.send("Tweet Removed");
  } else {
    response.status(401).send("Invalid Request");
  }
});

module.exports = app;
