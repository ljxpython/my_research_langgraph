/**
 * @name 代理的配置
 * @see 在生产环境 代理是无法生效的，所以这里没有生产环境的配置
 * -------------------------------
 * The agent cannot take effect in the production environment
 * so there is no configuration of the production environment
 * For details, please see
 * https://pro.ant.design/docs/deploy
 *
 * @doc https://umijs.org/docs/guides/proxy
 */

const CONTROL_PLANE_PROXY_TARGET =
  (process.env.CONTROL_PLANE_PROXY_TARGET as string) ||
  'http://127.0.0.1:8000';

export default {
  // 如果需要自定义本地开发服务器  请取消注释按需调整
  dev: {
    // 本地开发：将 /v1/** 代理到 Control Plane
    // 如果你在前端侧设置了 CONTROL_PLANE_BASE_URL，则不必依赖代理。
    '/v1/': {
      // 可通过环境变量覆盖（避免端口冲突）：CONTROL_PLANE_PROXY_TARGET=http://127.0.0.1:8000
      // 注意：该变量在前端 dev server 启动时读取。
      target: CONTROL_PLANE_PROXY_TARGET,
      changeOrigin: true,
    },
  },
  /**
   * @name 详细的代理配置
   * @doc https://github.com/chimurai/http-proxy-middleware
   */
  test: {
    // localhost:8000/api/** -> https://preview.pro.ant.design/api/**
    '/api/': {
      target: 'https://proapi.azurewebsites.net',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    },
    '/v1/': {
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    },
  },
  pre: {
    '/api/': {
      target: 'your pre url',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    },
    '/v1/': {
      target: 'your pre url',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    },
  },
};
