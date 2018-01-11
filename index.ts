import * as cheerio from 'cheerio';
import * as nodeurl from 'url';
import * as request from 'request';

export default class OgStatic {
    public static readonly DEFAULT_PROTOCOL = 'http';
    public static readonly shorthandProperties = {
        image: 'image:url',
        video: 'video:url',
        audio: 'audio:url'
    };


    public static async scrape<T>(url: string, options?): Promise<T> {
        const response = await OgStatic.getHtlm(url) as string;
        return OgStatic.parse(response, options);
    }

    public static async getHtlm(url: string): Promise<any> {
        let parsedUrl = nodeurl.parse(url);
        if (!parsedUrl.protocol) {
            parsedUrl = nodeurl.parse(`${OgStatic.DEFAULT_PROTOCOL}://${url}`);
        }
        const formatedUrl = nodeurl.format(parsedUrl);
        const requestOptions = {
            encoding: 'utf8',
            gzip: true,
            jar: true
        };
        return new Promise((resolve, reject) => {
            request.get(formatedUrl, requestOptions, (err, response) => {
                if (err) {
                    reject(err);
                }
                if (response.statusCode !== 200) {
                    reject(new Error('Request failed with HTTP status code: ' + response.statusCode));
                }
                resolve(response.body);
            });
        });

    }

    public static parse<T>(responseToParse: any, options?: any): T {
        options = options || {};
        let $;
        if (typeof responseToParse === 'string')
            $ = cheerio.load(responseToParse);

        // Check for xml namespace
        var namespace,
            $html = $('html');

        if ($html.length)
        {
            var attribKeys = Object.keys($html[0].attribs);

            attribKeys.some(function(attrName){
                var attrValue = $html.attr(attrName);

                if (attrValue.toLowerCase() === 'http://opengraphprotocol.org/schema/'
                    && attrName.substring(0, 6) == 'xmlns:')
                {
                    namespace = attrName.substring(6);
                    return false;
                }
            })
        }
        else if (options.strict)
            return null;

        if (!namespace)
            // If no namespace is explicitly set..
            if (options.strict)
                // and strict mode is specified, abort parse.
                return null;
            else
                // and strict mode is not specific, then default to "og"
                namespace = "og";

        var meta = {},
            metaTags = $('meta');

        metaTags.each(function() {
            var element = $(this),
                propertyAttr = element.attr('property');

            // If meta element isn't an "og:" property, skip it
            if (!propertyAttr || propertyAttr.substring(0, namespace.length) !== namespace)
                return;

            var property = propertyAttr.substring(namespace.length+1),
                content = element.attr('content');

            // If property is a shorthand for a longer property,
            // Use the full property
            property = OgStatic.shorthandProperties[property] || property;


            var key, tmp,
                ptr = meta,
                keys = property.split(':');

            // we want to leave one key to assign to so we always use references
            // as long as there's one key left, we're dealing with a sub-node and not a value

            while (keys.length > 1) {
                key = keys.shift();

                if (Array.isArray(ptr[key])) {
                    // the last index of ptr[key] should become
                    // the object we are examining.
                    tmp = ptr[key].length-1;
                    ptr = ptr[key];
                    key = tmp;
                }

                if (typeof ptr[key] === 'string') {
                    // if it's a string, convert it
                    ptr[key] = { '': ptr[key] };
                } else if (ptr[key] === undefined) {
                    // create a new key
                    ptr[key] = {};
                }

                // move our pointer to the next subnode
                ptr = ptr[key];
            }

            // deal with the last key
            key = keys.shift();

            if (ptr[key] === undefined) {
                ptr[key] = content;
            } else if (Array.isArray(ptr[key])) {
                ptr[key].push(content);
            } else {
                ptr[key] = [ ptr[key], content ];
            }
        });


        // If no 'og:title', use title tag
        if(!meta.hasOwnProperty('title')){
            meta['title'] = $('title').text();
        }


        // Temporary fallback for image meta.
        // Fallback to the first image on the page.
        // In the future, the image property could be populated
        // with an array of images, maybe.
        if(!meta.hasOwnProperty('image')){
            var img = $('img');

            // If there are image elements in the page
            if(img.length){
                var imgObj: any = {};
                imgObj.url = $('img').attr('src');

                // Set image width and height properties if respective attributes exist
                if($('img').attr('width'))
                    imgObj.width = $('img').attr('width');
                if($('img').attr('height'))
                    imgObj.height = $('img').attr('height');

                meta['image'] = imgObj;
            }

        }

        return meta as T;
    }

}