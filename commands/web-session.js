import "dotenv/config";
import { program } from "commander";
import {
  postModuleApp,
  updateProject,
  modifyProject,
  handleErrorMessage,
} from "../app/utils.js";

const passCommand = program
  .command("session <project>")
  .description("Develop in a session with the server")
  .action(async (project) => {
    const projectData = await updateProject(project);

    try {
      const response = await startSession({});

      // Check if the request was successful and save the JSON data to a file
      if (response) {
        // Example modifications
        // Initialize modifications as an object
        const modifications = {};

        // Update the property in the modifications object
        modifications[project] = {
          // Add or update properties as needed
          web_key: response.web_key,
        };

        // Call the function with the modifications
        await modifyProject(modifications);

        console.log(`Session started for ${project}.`);
        console.log(`You can now develop in a session with the server.`);
        console.log(`Your session header web-key : ${response.web_key}`);
        console.log(
          `Firefox header extension url : https://addons.mozilla.org/en-US/firefox/addon/modify-header-value/`
        );
      } else {
        console.error("Error running command.");
      }
    } catch (error) {
      handleErrorMessage(error);
    }

    async function startSession(payload) {
      try {
        const response = await postModuleApp(
          `${projectData[project].dev_url}/api/v1/session/${project}`,
          payload,
          projectData[project].access_key
        );

        if (response.data && response.status === "success") {
          return response.data;
        } else {
          console.error(`${response.message}`);
        }
      } catch (error) {
        handleErrorMessage(error);
      }
    }
  });

// Export passCommand as the default export
export default passCommand;
