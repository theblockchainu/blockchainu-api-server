const request = require('request-promise-native');

class Localization {
    constructor() { }

    getLocation(req) {
        // get user location here and add it to profile
        // const rawIpAddress = (req.headers['x-forwarded-for'] || '').split(',').pop() ||
        //     req.connection.remoteAddress ||
        //     req.socket.remoteAddress ||
        //     req.connection.socket.remoteAddress;
        const rawIpAddress = '::ffff:45.112.22.240'; //sample ipv6 address
        let remoteIp;
        const ipAddressDataArray = rawIpAddress.split(':');
        if (ipAddressDataArray.length > 1) {
            remoteIp = ipAddressDataArray.pop(); // extracting ipv4 address out of ipv6 address
        } else {
            remoteIp = rawIpAddress; // its a ipv4 address 
        }
        return request.get({
            url: 'https://ipapi.co/' + remoteIp + '/json/?key=b14b9508ef9b791d4e5d4efd25871e6d2eb84750',
            json: true
        });

        // Sample response
        // const data = {
        //     city: "Chennai",
        //     continent_code: "AS",
        //     country: "IN",
        //     country_calling_code: "+91",
        //     country_name: "India",
        //     currency: "INR",
        //     in_eu: false,
        //     ip: "45.112.22.240",
        //     languages: "en-IN,hi,bn,te,mr,ta,ur,gu,kn,ml,or,pa,as,bh,sat,ks,ne,sd,kok,doi,mni,sit,sa,fr,lus,inc",
        //     latitude: 13.0833,
        //     longitude: 80.2833,
        //     postal: "600003",
        //     region: "Tamil Nadu",
        //     region_code: "TN",
        //     timezone: "Asia/Kolkata",
        //     utc_offset: "+0530"
        // };
    }
}
module.exports = Localization;
