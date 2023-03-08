FROM node:16

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
COPY yarn.lock ./

RUN yarn install


# Bundle app source
COPY . .
RUN yarn build

# App is configured to run on port 8081
EXPOSE 8081
CMD ["node", "dist/index.js"]
