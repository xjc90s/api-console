import { assert, aTimeout, fixture, html, nextFrame } from '@open-wc/testing';
import { AmfLoader, ApiDescribe } from './amf-loader.js';
import '../api-console.js';
import '../api-console-app.js';

/** @typedef {import('../src/ApiConsole.js').ApiConsole} ApiConsole */
/** @typedef {import('../src/ApiConsoleApp.js').ApiConsoleApp} ApiConsoleApp */

/**
 * Coverage for the OAS 3.1/3.2 webhook try-it gating added in 228ef59b.
 * Webhooks have no invokable URL (the API calls the consumer), so the
 * request/response "try it" panel must be suppressed for them — in both the
 * narrow layout (tryit-requested handler + api-documentation `noTryIt`) and the
 * wide layout (inline request panel). Regular operations must be untouched.
 */
describe('OAS 3.1 webhook try-it gating', () => {
  /** @returns {Promise<ApiConsole>} */
  const consoleFixture = async (amf) => {
    const el = await fixture(html`<api-console .amf="${amf}"></api-console>`);
    await aTimeout(0);
    await nextFrame();
    return el;
  };

  /** @returns {Promise<ApiConsoleApp>} */
  const appFixture = async (amf) => {
    const el = await fixture(html`<api-console-app .amf="${amf}"></api-console-app>`);
    await aTimeout(0);
    await nextFrame();
    return el;
  };

  // @id of the first operation under the first top-level webhook (e.g. newPetWebhook).
  const webhookOperationId = (el) => {
    const webhooks = el._computeWebhooks(el.webApi);
    const opKey = el._getAmfKey(el.ns.aml.vocabularies.apiContract.supportedOperation);
    const ops = el._ensureArray(webhooks[0][opKey]);
    return ops[0]['@id'];
  };

  // @id of the first operation under the first regular endpoint (e.g. listPets on /pets).
  const endpointOperationId = (el) => {
    const endpoints = el._computeEndpoints(el.webApi);
    const opKey = el._getAmfKey(el.ns.aml.vocabularies.apiContract.supportedOperation);
    const ops = el._ensureArray(endpoints[0][opKey]);
    return ops[0]['@id'];
  };

  [new ApiDescribe('Regular model'), new ApiDescribe('Compact model', true)].forEach(({ label, compact }) => {
    describe(label, () => {
      let amf;
      before(async () => {
        amf = await AmfLoader.load({ compact, fileName: 'oas31-webhooks' });
      });

      // @covers _isWebhookOperation — predicate distinguishes webhook ops from regular ops
      it('detects a webhook operation and not a regular endpoint operation', async () => {
        const el = await consoleFixture(amf);
        const webhookId = webhookOperationId(el);
        const endpointId = endpointOperationId(el);

        assert.ok(webhookId, 'fixture exposes a webhook operation');
        assert.ok(endpointId, 'fixture exposes a regular endpoint operation');
        assert.notEqual(webhookId, endpointId, 'webhook and endpoint operations are distinct shapes');
        assert.isTrue(el._isWebhookOperation(webhookId, el.webApi), 'webhook operation is detected as a webhook');
        assert.isFalse(el._isWebhookOperation(endpointId, el.webApi), 'regular operation is not flagged as a webhook');
      });

      // @covers _tryitHandler + _apiDocumentationTemplate noTryIt — narrow-layout Try It gating
      it('narrow layout: suppresses Try It for a webhook but keeps it for a regular operation', async () => {
        const el = await consoleFixture(amf);
        const webhookId = webhookOperationId(el);
        const endpointId = endpointOperationId(el);

        // api-documentation receives noTryIt=true for a webhook (page stays 'docs').
        el.selectedShape = webhookId;
        await el.updateComplete;
        const docsForWebhook = el.shadowRoot.querySelector('api-documentation');
        assert.isNotNull(docsForWebhook, 'api-documentation renders on the docs page');
        assert.isTrue(docsForWebhook.noTryIt, 'webhook hides the Try It button (noTryIt=true)');

        // ...and noTryIt=false for a regular operation (over-broad-gating guard).
        el.selectedShape = endpointId;
        await el.updateComplete;
        const docsForEndpoint = el.shadowRoot.querySelector('api-documentation');
        assert.isFalse(docsForEndpoint.noTryIt, 'regular operation keeps the Try It button (noTryIt=false)');

        // The tryit-requested handler must not open the request panel for a webhook...
        el.selectedShape = webhookId;
        el.page = 'docs';
        el._tryitHandler();
        assert.equal(el.page, 'docs', 'webhook Try It does not switch to the request panel');

        // ...but must open it for a regular operation.
        el.selectedShape = endpointId;
        el.page = 'docs';
        el._tryitHandler();
        assert.equal(el.page, 'request', 'regular operation Try It opens the request panel');
      });

      // @covers _apiDocumentationTemplate (ApiConsoleApp) — wide-layout inline panel gating
      it('wide layout: hides the inline request panel for a webhook but renders it for a regular operation', async () => {
        const el = await appFixture(amf);
        el.wideLayout = true;
        el.selectedShapeType = 'method';
        await nextFrame();

        const webhookId = webhookOperationId(el);
        const endpointId = endpointOperationId(el);

        el.selectedShape = webhookId;
        await nextFrame();
        await nextFrame();
        assert.isNull(
          el.shadowRoot.querySelector('.inline-request'),
          'inline request panel is hidden for a webhook operation'
        );

        el.selectedShape = endpointId;
        await nextFrame();
        await nextFrame();
        assert.isNotNull(
          el.shadowRoot.querySelector('.inline-request'),
          'inline request panel renders for a regular operation'
        );
      });
    });
  });
});
