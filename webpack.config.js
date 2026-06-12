const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = (env = {}) => {
  const isMock = !!env.mock;

  const config = {
    entry: "./src/hub/hub.tsx",
    output: {
      filename: "hub.js",
      path: path.resolve(__dirname, "dist/hub"),
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"],
      alias: isMock
        ? {
            "azure-devops-extension-sdk": path.resolve(__dirname, "src/mocks/sdk.ts"),
            "azure-devops-extension-api/Core": path.resolve(__dirname, "src/mocks/core-client.ts"),
            "azure-devops-extension-api/Work": path.resolve(__dirname, "src/mocks/work-client.ts"),
            "azure-devops-extension-api/WorkItemTracking": path.resolve(__dirname, "src/mocks/work-item-tracking-client.ts"),
            "azure-devops-extension-api": path.resolve(__dirname, "src/mocks/api.ts"),
          }
        : {},
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.scss$/,
          use: ["style-loader", "css-loader", {
            loader: "sass-loader",
            options: { api: "modern" },
          }],
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
      ],
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [{ from: "src/hub/hub.html", to: "hub.html" }],
      }),
    ],
  };

  if (isMock) {
    config.devServer = {
      static: { directory: path.resolve(__dirname, "dist") },
      port: 3000,
      hot: true,
    };
    config.mode = "development";
    config.devtool = "inline-source-map";
  } else {
    config.mode = "production";
  }

  return config;
};
