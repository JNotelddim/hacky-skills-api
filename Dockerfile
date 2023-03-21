FROM node:16

# Create app directory
WORKDIR /usr/src/app

ARG BOLT_KEY_ARG
ARG AWS_ACCESS_KEY_ARG
ARG AWS_SECRET_KEY_ARG
ENV BOLT_KEY=$BOLT_KEY_ARG
ENV AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ARG
ENV AWS_SECRET_ACCESS_KEY=$AWS_SECRET_KEY_ARG

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
