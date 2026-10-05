import express from "express"

const app = express()

app.get("/",(req,res)=>{
  res.set("X-Backend","A");
	res.set("Cache-Control","max-age=60");
	res.json({
	message : "Hii from server A",
	machine: "M2 - Prakhar",
	ip: "10.7.28.103",
	port: 5001
})
})

// Bind to 0.0.0.0 so other machines on the network can reach this server
app.listen(5001, "0.0.0.0", ()=>{
console.log("server A up and running on http://0.0.0.0:5001")
})
