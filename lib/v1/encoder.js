/**!
 * hessian.js - lib/encoder.js
 * Copyright(c) 2014
 * MIT Licensed
 *
 * Authors:
 *   dead_horse <dead_horse@qq.com> (http://deadhorse.me)
 */

var assert = require('assert');
var ByteBuffer = require('byte');
var debug = require('debug')('hessian:v1:encoder');
var utils = require('../utils');
var javaObject = require('../object');

var Encoder = function () {
  //array of buffer
  this.byteBuffer = new ByteBuffer();
  this.objects = [];
};

var proto = Encoder.prototype;

/**
 * get the encode buffer
 * @return {Buffer}
 */
proto.get = function () {
  return this.byteBuffer.array();
};

/**
 * clean the buf
 */
proto.clean = function () {
  this.byteBuffer = new ByteBuffer();
  this.objects = [];
  return this;
};

/**
 * encode null
 * : N
 */
proto.writeNull = function () {
  this.byteBuffer.putChar('N');
  return this;
};

/**
 * encode bool
 * : T
 * : F
 */
proto.writeBool = function (val) {
  this.byteBuffer.putChar(val ? 'T' : 'F');
  return this;
};

/**
 * encode int
 * : I 0x00 0x00 0x00 0x10
 */
proto.writeInt = function (val) {
  this.byteBuffer
    .putChar('I')
    .putInt(val);
  return this;
};

/**
 * encode long
 * warning: we won't check if the long value is out of bound, be careful!
 * : L 0x00 0x00 0x00 0x00 0x10 0x32 0x33 0x12
 */
proto.writeLong = function (val) {
  this.byteBuffer
    .putChar('L')
    .putLong(val);
  return this;
};

/**
 * encode double
 * : D 0x00 0x00 0x00 0x00 0x10 0x32 0x33 0x12
 */
proto.writeDouble = function (val) {
  this.byteBuffer
    .putChar('D')
    .putDouble(val);
  return this;
};

/**
 * encode date
 * : d 0x00 0x00 0x00 0x00 0x10 0x32 0x33 0x12
 */
proto.writeDate = function (milliEpoch) {
  if (milliEpoch instanceof Date) {
    milliEpoch = milliEpoch.getTime();
  }
  assert(typeof milliEpoch === 'number', 'hessian writeDate input type invalid');

  this.byteBuffer
    .putChar('d')
    .putLong(milliEpoch);
  return this;
};

/**
 * encode buffer
 * : b 0x80 0x00 [...]
 *   B 0x00 0x03 [0x01 0x02 0x03]
 */
proto.writeBytes = function (buf) {
  assert(Buffer.isBuffer(buf), 'hession writeBytes input type invalid');

  var offset = 0;
  while (buf.length - offset >= utils.MAX_BYTE_TRUNK_SIZE) {
    this.byteBuffer
      .putChar('b')
      .putUInt16(utils.MAX_BYTE_TRUNK_SIZE)
      .put(buf.slice(offset, offset + utils.MAX_BYTE_TRUNK_SIZE));

    offset += utils.MAX_BYTE_TRUNK_SIZE;
  }

  this.byteBuffer
    .putChar('B')
    .putUInt16(buf.length - offset)
    .put(buf.slice(offset));
  return this;
};

/**
 * encode string
 * : s 0x80 0x00 [...]
 *   S 0x00 0x03 [0x01 0x02 0x03]
 */
proto.writeString = function (str) {
  assert(typeof str === 'string', 'hession writeString input type invalid');

  var offset = 0;

  while (str.length - offset >= utils.MAX_CHAR_TRUNK_SIZE) {
    this.byteBuffer
      .putChar('s')
      .putUInt16(utils.MAX_BYTE_TRUNK_SIZE)
      .putRawString(str.slice(offset, offset + utils.MAX_CHAR_TRUNK_SIZE));

    offset += utils.MAX_CHAR_TRUNK_SIZE;
  }

  this.byteBuffer
    .putChar('S')
    .putUInt16(str.length - offset)
    .putRawString(str.slice(offset));

  return this;
};

/**
 * encode length
 * : l 0x04 0x11 0xef 0x22
 */
proto.writeLength = function (length) {
  this.byteBuffer
    .putChar('l')
    .putUInt32(length);

  return this;
};

/**
 * encode type
 * : t [0x00 0x03] i n t
 */
proto.writeType = function (type) {
  type = type || '';
  assert(typeof type === 'string', 'hessian writeType input type invalid');
  this.byteBuffer
    .putChar('t')
    .putUInt16(type.length)
    .putRawString(type);

  return this;
};

/**
 * encode ref
 * : R 0x00 0x00 0x00 0x11
 */
proto.writeRef = function (refId) {
  this.byteBuffer
    .putChar('R')
    .putInt(refId);

  return this;
};

proto._checkRef = function (obj) {
  var refIndex = this.objects.indexOf(obj);
  if (refIndex >= 0) {
    // already have this object
    // just write ref
    debug('writeObject with a refIndex: %d', refIndex);
    this.writeRef(refIndex);
    return true;
  }
  // a new comming object
  this.objects.push(obj);
  return false;
};

/**
 * encode object
 *   support circular
 *   support all kind of java object
 * : {a: 1}
 * : {$class: 'java.lang.Map', $: {a: 1}}
 */
proto.writeObject = function (obj) {
  assert(typeof obj === 'object',
    'hessian writeObject / writeObject input type invalid');
  if (obj === null || obj === undefined) {
    debug('writeObject with a null');
    return this.writeNull();
  }

  if (this._checkRef(obj)) {
    // if is ref, will write by _checkRef
    return this;
  }

  // start with 'M'
  this.byteBuffer.putChar('M');

  var className = '';
  var realObj;
  if (!obj.$class || !obj.$) {
    // : {a: 1}
    realObj = obj;
    debug('writeObject with simple object');
  } else {
    // : {$class: 'java.utils.Map', $: {a: 1}}
    className = obj.$class === javaObject.DEFAULT_CLASSNAME.map ? '' : obj.$class;
    realObj = obj.$;
    debug('writeObject with complex object, className: %s', className);
  }

  this.writeType(className);
  for (var key in realObj) {
    this.write(key);
    this.write(realObj[key]);
  }
  //end with 'z'
  this.byteBuffer.putChar('z');
  return this;
};

proto.writeMap = proto.writeObject;

proto.writeArray = function (arr) {
  var isSimpleArray = Array.isArray(arr);
  var className = '';
  var realArray = arr;
  if (!isSimpleArray) {
    var isComplexArray = typeof arr === 'object' &&
      typeof arr.$class === 'string' && Array.isArray(arr.$);
    assert(isComplexArray, 'hessian writeArray input type invalid');

    className = arr.$class === javaObject.DEFAULT_CLASSNAME.list ? '' : arr.$class;
    realArray = arr.$;
  }

  if (this._checkRef(arr)) {
    // if is ref, will write by _checkRef
    return this;
  }

  this.byteBuffer.putChar('V');
  this.writeType(className);
  this.writeLength(realArray.length);
  for (var i = 0; i < realArray.length; i++) {
    this.write(realArray[i]);
  }
  this.byteBuffer.putChar('z');
  return this;
};

proto.writeList = proto.writeArray;

/**
 * write any type
 * @param {Object|Number|String|Boolean|Array} val
 * : 1 => int
 * : 1.1 => double
 * :
 */
proto.write = function (val) {
  var type = typeof val;
  if (val === undefined || val === null || Number.isNaN(val)) {
    return this.writeNull();
  }
  switch (type) {
  case 'boolean':
    return this.writeBool(val);
  case 'string':
    return this.writeString(val);
  case 'number':
    var isInt = parseFloat(val) === parseInt(val, 10);
    if (isInt) {
      // long
      if (val >= utils.MAX_INT_32) {
        debug('write number %d as long', val);
        return this.writeLong(val);
      }
      debug('write number %d as int', val);
      return this.writeInt(val);
    }
    // double
    debug('write number %d as double', val);
    return this.writeDouble(val);
  }

  if (val instanceof Date) {
    debug('write Date: %s', val);
    return this.writeDate(val);
  }

  if (Array.isArray(val)) {
    debug('write simple array with a length of %d', val.length);
    return this.writeArray(val);
  }

  // Object
  // {a: 1, b: 'test'}
  if (!val.$class || !val.$) {
    debug('write simple object');
    return this.writeObject(val);
  }

  var method = utils.getSerializer(val.$class);
  debug('write detect %s use serializer %s', val.$class, method || 'none');
  if (!method) {
    throw new Error('hessian write $class invalid');
  }
  // {$class: 'long', $: 123}
  if (method !== 'writeObject' && method !== 'writeArray') {
    return this[method](val.$);
  }
  // {$class: 'java.util.Map', $: {a: 1}}
  return this[method](val);
};

module.exports = Encoder;