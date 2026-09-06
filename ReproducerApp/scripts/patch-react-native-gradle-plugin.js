const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

const patches = [
  {
    file: 'node_modules/@react-native/gradle-plugin/settings.gradle.kts',
    replacements: [
      [
        'plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0") }\n\n',
        '',
      ],
      [
        '    mavenCentral()\n    google()\n    gradlePluginPortal()\n',
        '    mavenCentral()\n    gradlePluginPortal()\n    google()\n',
      ],
    ],
  },
  {
    file: 'node_modules/@react-native/gradle-plugin/build.gradle.kts',
    replacements: [
      ['  alias(libs.plugins.ktfmt).apply(true)\n', ''],
      [
        'tasks.named("ktfmtCheck") {\n  dependsOn(\n      ":react-native-gradle-plugin:ktfmtCheck",\n      ":settings-plugin:ktfmtCheck",\n      ":shared-testutil:ktfmtCheck",\n      ":shared:ktfmtCheck",\n  )\n}\n\n',
        '',
      ],
      [
        'tasks.named("ktfmtFormat") {\n  dependsOn(\n      ":react-native-gradle-plugin:ktfmtFormat",\n      ":settings-plugin:ktfmtFormat",\n      ":shared-testutil:ktfmtFormat",\n      ":shared:ktfmtFormat",\n  )\n}\n\n',
        '',
      ],
      [
        '// We intentionally disable the `ktfmtCheck` tasks as the formatting is primarly handled inside\n// fbsource\nallprojects { tasks.withType<com.ncorti.ktfmt.gradle.tasks.KtfmtCheckTask>() { enabled = false } }\n',
        '',
      ],
    ],
  },
  {
    file: 'node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/build.gradle.kts',
    replacements: [
      ['  alias(libs.plugins.ktfmt)\n', ''],
      ['  google()\n  mavenCentral()\n', '  mavenCentral()\n  google()\n'],
    ],
  },
  {
    file: 'node_modules/@react-native/gradle-plugin/settings-plugin/build.gradle.kts',
    replacements: [
      ['  alias(libs.plugins.ktfmt)\n', ''],
      ['  google()\n  mavenCentral()\n', '  mavenCentral()\n  google()\n'],
    ],
  },
  {
    file: 'node_modules/@react-native/gradle-plugin/shared/build.gradle.kts',
    replacements: [['  alias(libs.plugins.ktfmt)\n', '']],
  },
  {
    file: 'node_modules/@react-native/gradle-plugin/shared-testutil/build.gradle.kts',
    replacements: [['  alias(libs.plugins.ktfmt)\n', '']],
  },
];

for (const patch of patches) {
  const filePath = path.join(projectRoot, patch.file);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected file to exist: ${patch.file}`);
  }

  let contents = fs.readFileSync(filePath, 'utf8');

  for (const [searchValue, replaceValue] of patch.replacements) {
    if (!contents.includes(searchValue) && !contents.includes(replaceValue)) {
      throw new Error(`Patch no longer matches ${patch.file}`);
    }

    contents = contents.replace(searchValue, replaceValue);
  }

  fs.writeFileSync(filePath, contents);
}
