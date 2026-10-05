import express from "express"

const app = express()

app.get("/",(req,res)=>{
  res.set("X-Backend","A");
	res.set("Cache-Control","max-age=60");
	res.json({
	message : "Hii from server A"
})
})

app.listen(5001,()=>{
console.log("server A up and running on http://localhost:5001")
})
