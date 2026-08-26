import { assert, aTimeout, fixture, html, waitUntil } from '@open-wc/testing';
import { AmfLoader, ApiDescribe } from './amf-loader.js';
import '../api-console.js';

/** @typedef {import('..').ApiConsole} ApiConsole */

/**
 * W-23748890 AC2 — OAS 3.2 QUERY HTTP method support.
 *
 * The `oas32-query-sse` fixture declares a `query:` operation as a sibling of
 * `get:` on `/pets` (see demo/models/oas32-query-sse/oas32-query-sse.yaml).
 * These tests assert the console treats `query` as a first-class HTTP method:
 * it resolves the operation from the model and renders it with the dedicated
 * QUERY method label + teal query color, rather than dropping it or falling
 * back to the default (gray) label.
 *
 * Render path (verified against the installed components):
 *   api-console -> api-documentation -> api-method-documentation
 *     -> api-url -> `.method-label[data-method='query']`
 * The teal query color lives in api-method-documentation/src/Styles.js:
 *   `.method-label[data-method='query'] { color: #0f9d9d }` == rgb(15, 157, 157).
 * This mirrors the existing APIC-571 (publish) assertion in api-console.amf.test.js.
 *
 * Only Regular + Compact models are exercised — there is no flattened model on
 * disk for this fixture. COPY/MOVE are intentionally NOT asserted: no fixture
 * declares them (amf 5.11.x does not parse COPY/MOVE from OAS 3.2).
 */

const QUERY_FIXTURE = 'oas32-query-sse';
// amf 5.11.x preserves the original case of the non-standard QUERY method in the
// model (apiContract#method === "QUERY"), unlike standard verbs which it
// lowercases (e.g. "get"). Look it up by the value amf actually stored. The
// render layer normalises it back to lowercase for data-method / color.
const QUERY_METHOD = 'QUERY';
// #0f9d9d -> rgb(15, 157, 157). getComputedStyle normalises hex to rgb().
const QUERY_TEAL = 'rgb(15, 157, 157)';
// Default (unknown-method) label color, from http-method-label CommonStyles.
const DEFAULT_GRAY = 'rgb(128, 128, 128)';

/**
 * @param {any} amf
 * @param {string} selected selectedShape id
 * @returns {Promise<ApiConsole>}
 */
const selectedMethodFixture = async (amf, selected) => {
  const element = /** @type ApiConsole */ (await fixture(html`
    <api-console
      .amf="${amf}"
      .selectedShape="${selected}"
      .selectedShapeType="${'method'}"
    ></api-console>
  `));
  await aTimeout(0);
  return element;
};

/**
 * Walks the console shadow chain down to the rendered method label for a
 * selected operation.
 * @param {any} amf
 * @param {string} operationId
 * @returns {Promise<Element>} the `.method-label` element inside api-url
 */
const methodLabelFor = async (amf, operationId) => {
  const element = await selectedMethodFixture(amf, operationId);
  const documentation = element.shadowRoot.querySelector('api-documentation');
  await waitUntil(
    () => Boolean(documentation.shadowRoot.querySelector('api-method-documentation')),
    'api-method-documentation rendered'
  );
  const methodDocumentation = documentation.shadowRoot.querySelector('api-method-documentation');
  await waitUntil(
    () => Boolean(methodDocumentation.shadowRoot.querySelector('api-url')),
    'api-url rendered'
  );
  const apiUrl = methodDocumentation.shadowRoot.querySelector('api-url');
  await waitUntil(
    () => Boolean(apiUrl.shadowRoot.querySelector('.method-label')),
    'method label rendered'
  );
  return apiUrl.shadowRoot.querySelector('.method-label');
};

describe('API Console OAS 3.2 QUERY method (W-23748890 AC2)', () => {
  [
    new ApiDescribe('Regular model'),
    new ApiDescribe('Compact model', true),
  ].forEach(({ label, compact }) => {
    describe(label, () => {
      let amf;

      before(async () => {
        amf = await AmfLoader.load({ compact, fileName: QUERY_FIXTURE });
      });

      // @covers AC2
      it('resolves the `query` operation as a first-class method on /pets', () => {
        const [endpoint, operation] = AmfLoader.lookupEndpointOperation(amf, '/pets', QUERY_METHOD);
        assert.ok(endpoint, 'endpoint /pets is present in the model');
        assert.ok(operation, 'query operation is resolved (not dropped)');
        const method = AmfLoader.lookupOperation(amf, '/pets', QUERY_METHOD);
        assert.ok(method, 'query operation is addressable by its HTTP method');
      });

      // @covers AC2
      it('renders the QUERY method label in method documentation', async () => {
        const [, operation] = AmfLoader.lookupEndpointOperation(amf, '/pets', QUERY_METHOD);
        const methodLabel = await methodLabelFor(amf, operation['@id']);
        assert.equal(
          methodLabel.getAttribute('data-method'),
          'query',
          'label carries data-method="query"'
        );
        assert.equal(
          methodLabel.textContent.trim().toLowerCase(),
          'query',
          'label text is QUERY (rendered uppercase via CSS)'
        );
      });

      // @covers AC2
      it('styles the QUERY label with the teal query color, not the default gray', async () => {
        const [, operation] = AmfLoader.lookupEndpointOperation(amf, '/pets', QUERY_METHOD);
        const methodLabel = await methodLabelFor(amf, operation['@id']);
        const { color } = getComputedStyle(methodLabel);
        assert.notEqual(color, DEFAULT_GRAY, 'QUERY is not rendered with the default (unknown method) gray');
        assert.equal(color, QUERY_TEAL, 'QUERY label uses the teal query color #0f9d9d');
      });
    });
  });
});
