const gulp = require('gulp');
const ts = require('gulp-typescript');
const del = require('del');

const tsProject = ts.createProject('tsconfig.json');

const clean = () => {
  return del('dist');
};

const build = () => {
  return tsProject.src().pipe(tsProject()).pipe(gulp.dest('dist'));
};

exports.default = gulp.series(clean, build);
