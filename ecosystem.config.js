module.exports = {
  apps: [
    {
      name: "eliza-cloud-ui-3000",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      cwd: "/home/shad0w/projects/eliza-cloud-v2-milady-pack",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        NEXT_DIST_DIR: ".next-build",
      },
      env_file: "/home/shad0w/projects/eliza-cloud-v2-milady-pack/.env.local",
    },
  ],
};
