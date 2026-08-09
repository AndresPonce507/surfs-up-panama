// CloudFront Function (viewer-request) for the static preview distribution.
//
// The build emits `format: 'file'` artifacts, so a page lives at
// `spots/playa-venao.html`, while every internal link in the site is the
// directory form `/spots/playa-venao/`. An S3 REST origin serves no index
// document, so those directory requests returned 403 AccessDenied and every
// spot link on the hosted preview was dead.
//
// This rewrites the request URI to the artifact that actually exists:
//   /spots/playa-venao/  ->  /spots/playa-venao.html
//   /manana              ->  /manana.html
//   /                    ->  untouched (DefaultRootObject serves index.html)
//
// It also retires the hand-created literal `manana/` S3 key, which was a
// one-route workaround for this same gap.
//
// Runtime is cloudfront-js-2.0. Keep to ES5 string methods; `endsWith` and
// template literals are not guaranteed here.

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri === '/') {
    return request;
  }

  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri.substring(0, uri.length - 1) + '.html';
    return request;
  }

  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = uri + '.html';
  }

  return request;
}
