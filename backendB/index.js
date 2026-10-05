import express from "express"

const app = express()

app.get("/",(req,res)=>{
res.set("X-Backend","B");
res.set("Cache-Control","max-age=60")
 res.json({
	message : "Hii from server B",
	machine: "M3 - Soumen",
	ip: "10.7.6.34",
	port: 5002
})
})

// Bind to 0.0.0.0 so other machines on the network can reach this server
app.listen(5002, "0.0.0.0", ()=>{
console.log("server B up and running on http://0.0.0.0:5002")
})
