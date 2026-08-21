'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findPublicBrand } = require('./index');

test('matches real chain branches and punctuation variants', () => {
  assert.equal(findPublicBrand('State Bank of India - Gachibowli Branch')?.key, 'sbi');
  assert.equal(findPublicBrand('ICICI Bank | Madhapur')?.key, 'icici-bank');
  assert.equal(findPublicBrand("McDonald's Ashok Pillar")?.key, 'mcdonalds');
  assert.equal(findPublicBrand('Croma - Kondapur')?.key, 'croma');
  assert.equal(findPublicBrand('Apollo Pharmacy Miyapur')?.key, 'apollo-pharmacy');
});

test('does not capture unrelated businesses that merely mention a brand', () => {
  assert.equal(findPublicBrand('Ambition Institute of Banking and SSC'), null);
  assert.equal(findPublicBrand('HDFC ERGO Insurance Agent: Ravi Kumar'), null);
  assert.equal(findPublicBrand('SBI Life Insurance'), null);
  assert.equal(findPublicBrand('Axis Consultancy'), null);
  assert.equal(findPublicBrand('Bittu Burger King'), null);
  assert.equal(findPublicBrand('Cheap Salon Near Villivakkam Subway'), null);
  assert.equal(findPublicBrand('Eurokids near DMart'), null);
});

test('excludes known non-branch products and affiliates', () => {
  assert.equal(findPublicBrand('SBI Securities'), null);
  assert.equal(findPublicBrand('Canara HSBC Life Insurance'), null);
  assert.equal(findPublicBrand('KFC Universal Ministries'), null);
  assert.equal(findPublicBrand('DMart Furniture'), null);
});
