/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk';

/**
 * The structure of a shirt entry in the shirt database.
 */
type ShirtDescriptor = {
	displayName: string;
	resourceName: string;
	scale: {
		x: number;
		y: number;
		z: number;
	};
	rotation: {
		x: number;
		y: number;
		z: number;
	};
	position: {
		x: number;
		y: number;
		z: number;
	};
};

/**
 * The structure of the shirt database.
 */
type ShirtDatabase = {
	[key: string]: ShirtDescriptor;
};

// Load the database of shirts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ShirtDatabase: ShirtDatabase = require('../public/shirts.json');

/**
 * WearAShirt Application - Showcasing avatar attachments.
 */
export default class WearAShirt {
	// Container for preloaded shirt prefabs.
	private assets: MRE.AssetContainer;
	private prefabs: { [key: string]: MRE.Prefab } = {};
	// Container for instantiated shirts.
	private attachedShirts = new Map<MRE.Guid, MRE.Actor>();

	/**
	 * Constructs a new instance of this class.
	 * @param context The MRE SDK context.
	 * @param baseUrl The baseUrl to this project's `./public` folder.
	 */
	constructor(private context: MRE.Context) {
		this.assets = new MRE.AssetContainer(context);
		// Hook the context events we're interested in.
		this.context.onStarted(() => this.started());
		this.context.onUserLeft(user => this.userLeft(user));
	}

	/**
	 * Called when a Shirts application session starts up.
	 */
	private async started() {
		// Check whether code is running in a debuggable watched filesystem
		// environment and if so delay starting the app by 1 second to give
		// the debugger time to detect that the server has restarted and reconnect.
		// The delay value below is in milliseconds so 1000 is a one second delay.
		// You may need to increase the delay or be able to decrease it depending
		// on the speed of your PC.
		const delay = 1000;
		const argv = process.execArgv.join();
		const isDebug = argv.includes('inspect') || argv.includes('debug');

		// // version to use with non-async code
		// if (isDebug) {
		// 	setTimeout(this.startedImpl, delay);
		// } else {
		// 	this.startedImpl();
		// }

		// version to use with async code
		if (isDebug) {
			await new Promise(resolve => setTimeout(resolve, delay));
			await this.startedImpl();
		} else {
			await this.startedImpl();
		}
	}

	// use () => {} syntax here to get proper scope binding when called via setTimeout()
	// if async is required, next line becomes private startedImpl = async () => {
	private startedImpl = async () => {
		// Preload all the shirt models.
		await this.preloadShirts();
		// Show the shirt menu.
		this.showMenu();
	}

	/**
	 * Called when a user leaves the application (probably left the Altspace world where this app is running).
	 * @param user The user that left the building.
	 */
	private userLeft(user: MRE.User) {
		// If the user was wearing a shirt, destroy it. Otherwise it would be
		// orphaned in the world.
		this.removeShirts(user);
	}

	/**
	 * Show a menu of shirt selections.
	 */
	private showMenu() {
		// Create a parent object for all the menu items.
		const menu = MRE.Actor.Create(this.context, {});
		let y = 0.3;

		// Create menu button
		const buttonMesh = this.assets.createBoxMesh('button', 0.3, 0.3, 0.01);

		// Loop over the shirt database, creating a menu item for each entry.
		for (const shirtId of Object.keys(ShirtDatabase)) {
			// Create a clickable button.
			const button = MRE.Actor.Create(this.context, {
				actor: {
					parentId: menu.id,
					name: shirtId,
					appearance: { meshId: buttonMesh.id },
					collider: { geometry: { shape: MRE.ColliderType.Auto } },
					transform: {
						local: { position: { x: 0, y, z: 0 } }
					}
				}
			});

			// Set a click handler on the button.
			button.setBehavior(MRE.ButtonBehavior)
				.onClick(user => this.wearShirt(shirtId, user.id));

			// Create a label for the menu entry.
			MRE.Actor.Create(this.context, {
				actor: {
					parentId: menu.id,
					name: 'label',
					text: {
						contents: ShirtDatabase[shirtId].displayName,
						height: 0.5,
						anchor: MRE.TextAnchorLocation.MiddleLeft
					},
					transform: {
						local: { position: { x: 0.5, y, z: 0 } }
					}
				}
			});
			y = y + 0.5;
		}

		// Create a label for the menu title.
		MRE.Actor.Create(this.context, {
			actor: {
				parentId: menu.id,
				name: 'label',
				text: {
					contents: ''.padStart(8, ' ') + "Select a Shirt",
					height: 0.8,
					anchor: MRE.TextAnchorLocation.MiddleCenter,
					color: MRE.Color3.Yellow()
				},
				transform: {
					local: { position: { x: 0.5, y: y + 0.25, z: 0 } }
				}
			}
		});
	}

	/**
	 * Preload all shirt resources. This makes instantiating them faster and more efficient.
	 */
	private preloadShirts() {
		// Loop over the shirt database, preloading each shirt resource.
		// Return a promise of all the in-progress load promises. This
		// allows the caller to wait until all shirts are done preloading
		// before continuing.
		return Promise.all(
			Object.keys(ShirtDatabase).map(shirtId => {
				const shirtRecord = ShirtDatabase[shirtId];
				if (shirtRecord.resourceName) {
					return this.assets.loadGltf(shirtRecord.resourceName)
						.then(assets => {
							this.prefabs[shirtId] = assets.find(a => a.prefab !== null) as MRE.Prefab;
						})
						.catch(e => MRE.log.error("app", e));
				} else {
					return Promise.resolve();
				}
			}));
	}

	/**
	 * Instantiate a shirt and attach it to the avatar.
	 * @param shirtId The id of the shirt in the shirt database.
	 * @param userId The id of the user we will attach the shirt to.
	 */
	private wearShirt(shirtId: string, userId: MRE.Guid) {
		const shirtRecord = ShirtDatabase[shirtId];

		// If the user selected 'none', then early out.
		if (!shirtRecord.resourceName) {
			// If the user is wearing a shirt, destroy it.
			this.removeShirts(this.context.user(userId));
			return;
		}

		// If the user is wearing a shirt, destroy it.
		this.removeShirts(this.context.user(userId));

		// Create the shirt model and attach it to the avatar's head.
		this.attachedShirts.set(userId, MRE.Actor.CreateFromPrefab(this.context, {
			prefab: this.prefabs[shirtId],
			actor: {
				transform: {
					local: {
						position: shirtRecord.position,
						rotation: MRE.Quaternion.FromEulerAngles(
							shirtRecord.rotation.x * MRE.DegreesToRadians,
							shirtRecord.rotation.y * MRE.DegreesToRadians,
							shirtRecord.rotation.z * MRE.DegreesToRadians),
						scale: shirtRecord.scale,
					}
				},
				attachment: {
					attachPoint: 'spine-middle',
					userId
				}
			}
		}));
	}

	private removeShirts(user: MRE.User) {
		if (this.attachedShirts.has(user.id)) { this.attachedShirts.get(user.id).destroy(); }
		this.attachedShirts.delete(user.id);
	}

}
