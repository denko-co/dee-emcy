FROM node

RUN apt-get update

COPY . /app
WORKDIR /app

RUN npm install

CMD node index.js
