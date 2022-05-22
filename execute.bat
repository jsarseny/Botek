@echo on
cmd "MongoDB Server 4.2" "c:/Program Files/MongoDB/Server/4.2/bin/mongod.exe" --dbpath "c:/Program Files/MongoDB/Server/4.2/data/"
cmd "Bot Runtime" node.exe bot.mjs