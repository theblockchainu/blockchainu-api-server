# Blockchain University Api Server
This repository contains project files for Blockchain University API Server.

## Setup Instructions
1. Install the dependeccies.
```
npm i
```
2. Replace the *scope.js* file in 
> \node_modules\loopback-datasource-juggler\lib\scope.js

3. Start the server using 
```
npm start
```

## Future enhancements

1. Implement CI and CD.
2. Write Unit tests (specs) and end to end tests.
3. Setup an automated test suite have test coverage over 80%.
4. Implement caching using redis/memcached and rabbitMQ
5. Setup multiple EC2 instances with load balancers.
6. Emulate multithreading as much as possible.
7. Convert all callback code to async/await or promise code.
8. Write better comments for swagger documentation.
9. Upgrade to loopback 4 once available. ( It's  typescript pased, so better control over code)