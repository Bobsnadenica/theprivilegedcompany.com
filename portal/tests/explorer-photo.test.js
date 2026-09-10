import test from 'node:test';
import assert from 'node:assert/strict';
import {publicPhoto} from '../src/explorer-photo.js';
const photo={url:'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Example.jpg/960px-Example.jpg',page:'https://commons.wikimedia.org/wiki/File:Example.jpg',author:'Example author',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'};
test('browsing photos require source attribution and exact trusted HTTPS hosts',()=>{
 assert.equal(publicPhoto(photo),photo);
 assert.equal(publicPhoto({...photo,url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg'}).author,photo.author);
 for(const bad of [null,{}, {...photo,author:''},{...photo,license:''},{...photo,url:'http://thumb.wikimedia.org/image.jpg'},{...photo,url:'https://thumb.wikimedia.org.example.com/image.jpg'},{...photo,url:'https://user:pass@thumb.wikimedia.org/image.jpg'},{...photo,page:'javascript:alert(1)'},{...photo,licenseUrl:'https://example.com'}])assert.equal(publicPhoto(bad),null);
});
